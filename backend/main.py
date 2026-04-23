from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import time
from datetime import datetime
import json
import os
import re
import secrets
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func

import models, schemas, crud, database
from security import hash_password, verify_password, create_access_token, verify_token
# The chatbot logic itself lives in one small file now.
# main.py only exposes the HTTP routes and forwards the request.
from simple_chatbot import (
    OLLAMA_URL,
    ask_chatbot as ask_simple_chatbot,
    get_article_brief as get_simple_article_brief,
    get_chatbot_status as get_simple_chatbot_status,
)

app = FastAPI()
NEWSDATA_API_URL = "https://newsdata.io/api/1/news"
NEWSDATA_API_KEY = os.getenv("NEWSDATA_API_KEY", "pub_e79060a6b07f48949fbc203737376524")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def get_model_fields_set(model) -> set[str]:
    # Compatibility helper for both Pydantic v1 and v2.
    # We use it when we need to know which fields were explicitly sent by the frontend.
    fields = getattr(model, "model_fields_set", None)
    if fields is not None:
        return set(fields)
    legacy_fields = getattr(model, "__fields_set__", None)
    if legacy_fields is not None:
        return set(legacy_fields)
    return set()


def serialize_user(user: models.User):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "profile_photo": user.profile_photo,
        "interests": [
            interest.name.lower()
            for interest in sorted(user.interests, key=lambda interest: interest.name.lower())
        ],
    }


def create_user_access_token(user: models.User) -> str:
    return create_access_token(data={"sub": user.email, "user_id": user.id})


def derive_display_name_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0].strip()
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", local_part).strip()
    if not cleaned:
        return "NewsHub User"

    return " ".join(part.capitalize() for part in cleaned.split())


def find_or_create_user_from_token(
    db: Session,
    user_id: Optional[int],
    email: Optional[str],
) -> Optional[models.User]:
    user: Optional[models.User] = None

    if user_id is not None:
        user = db.query(models.User).filter(models.User.id == user_id).first()

    if user is None and email:
        normalized_email = email.lower()
        user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()

        if user is None:
            bootstrap_user = models.User(
                full_name=derive_display_name_from_email(normalized_email),
                email=normalized_email,
                password_hash=hash_password(secrets.token_urlsafe(24)),
            )
            if user_id is not None:
                bootstrap_user.id = user_id

            db.add(bootstrap_user)
            try:
                db.commit()
                db.refresh(bootstrap_user)
                user = bootstrap_user
            except IntegrityError:
                db.rollback()
                user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()

    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("user_id")
    email = payload.get("sub")
    user = find_or_create_user_from_token(db, user_id, email)

    if user is None:
        raise credentials_exception

    return user


def ensure_matching_user(user_id: Optional[int], current_user: models.User) -> None:
    if user_id is not None and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not allowed to access this resource.")


def normalize_profile_photo(profile_photo: Optional[str]) -> Optional[str]:
    if profile_photo is None:
        return None

    normalized = profile_photo.strip()
    if not normalized:
        return None

    if not normalized.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Profile photo must be a valid image file.")

    if len(normalized) > 2_500_000:
        raise HTTPException(status_code=400, detail="Profile photo is too large. Please choose a smaller image.")

    return normalized


def get_managed_user(
    user_id: int,
    current_user: models.User,
    db: Session,
) -> models.User:
    ensure_matching_user(user_id, current_user)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def build_profile_update_response(user: models.User) -> dict:
    access_token = create_user_access_token(user)
    return {
        "message": "Profile updated successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    print(f"Incoming request: {request.method} {request.url}")
    response = await call_next(request)
    process_time = time.time() - start_time
    print(f"Finished request: {request.method} {request.url} - Status: {response.status_code} - Time: {process_time:.2f}s")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Temporarily allow ALL for debugging
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.on_event("startup")
def apply_runtime_schema_updates():
    try:
        database.ensure_schema_extensions()
    except Exception as exc:
        print(f"Schema extension warning: {exc}")


@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return serialize_user(current_user)


@app.get("/news-feed") # filtering parameters are passed through query string, e.g. /news-feed?category=technology&language=en
def get_news_feed(request: Request):
    forwarded_params = {
        key: value
        for key, value in request.query_params.items() 
        if key != "apikey" and value not in (None, "")
    }
    forwarded_params["apikey"] = NEWSDATA_API_KEY

    provider_url = f"{NEWSDATA_API_URL}?{urlencode(forwarded_params)}"

    try:
        with urlopen(provider_url, timeout=15) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(
            status_code=exc.code,
            detail=detail or "The upstream news provider returned an error.",
        )
    except URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"The upstream news provider is currently unavailable: {exc.reason}",
        )

@app.get("/interests")
def get_interests(db: Session = Depends(database.get_db)):
    try:
        interests = db.query(models.Interest).all()
        return [{"id": i.id, "name": i.name} for i in interests]
    except Exception as e:
        print(f"Error fetching interests: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch interests")

@app.post("/complete-signup")
def complete_signup(data: schemas.SignupData, db: Session = Depends(database.get_db)):
    try:
        print(f"--- Atomic Signup attempt for {data.email} ---")

        if len(data.interest_ids) > 3:
            raise HTTPException(status_code=400, detail="You can select up to 3 interests.")
        
        # 1. Insert User
        new_user = models.User(
            full_name=data.full_name,
            email=data.email,
            password_hash=hash_password(data.password)
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        print(f"User created with ID: {new_user.id}")

        # 2. Insert Interests
        if data.interest_ids:
            interests = [models.UserInterest(user_id=new_user.id, interest_id=i_id) for i_id in data.interest_ids]
            db.add_all(interests)
            db.commit()
            print(f"Linked {len(data.interest_ids)} interests.")

        print("Signup transaction committed successfully.")
        db.refresh(new_user)
        access_token = create_user_access_token(new_user)
        return {
            "message": "Signup complete",
            "user_id": new_user.id,
            "access_token": access_token,
            "token_type": "bearer",
            "user": serialize_user(new_user),
        }
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This email is already registered.")
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        print("--- Atomic Signup finished ---")

@app.get("/check-email/{email}")
def check_email(email: str, db: Session = Depends(database.get_db)):
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        return {"exists": user is not None}
    except Exception as e:
        print(f"Error checking email: {e}")
        raise HTTPException(status_code=500, detail="Error checking email")

@app.post("/login")
def login(data: schemas.LoginData, db: Session = Depends(database.get_db)):
    try:
        user = db.query(models.User).filter(models.User.email == data.email).first()
        
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        access_token = create_user_access_token(user)
        return {
            "message": "Login successful", 
            "access_token": access_token,
            "token_type": "bearer",
            "user": serialize_user(user),
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user_profile(user_id: int, current_user: models.User = Depends(get_current_user)):
    ensure_matching_user(user_id, current_user)
    return serialize_user(current_user)


@app.put("/users/{user_id}/profile")
def update_user_profile(
    user_id: int,
    data: schemas.ProfileDetailsUpdateData,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        user = get_managed_user(user_id, current_user, db)

        normalized_name = data.full_name.strip()
        normalized_email = data.email.strip().lower()

        if not normalized_name:
            raise HTTPException(status_code=400, detail="Full name is required")

        if not normalized_email:
            raise HTTPException(status_code=400, detail="Email is required")

        existing_user = db.query(models.User).filter(
            func.lower(models.User.email) == normalized_email,
            models.User.id != user_id
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="This email is already registered. Please use a different one.")

        if data.new_password:
            if len(data.new_password) < 8:
                raise HTTPException(status_code=400, detail="The new password must contain at least 8 characters.")
            if not data.current_password:
                raise HTTPException(status_code=400, detail="Current password is required to change your password.")
            if not verify_password(data.current_password, user.password_hash):
                raise HTTPException(status_code=400, detail="The current password is incorrect.")

            user.password_hash = hash_password(data.new_password)

        user.full_name = normalized_name
        user.email = normalized_email

        db.commit()
        db.refresh(user)
        return build_profile_update_response(user)
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/users/{user_id}/profile/photo")
def update_user_profile_photo(
    user_id: int,
    data: schemas.ProfilePhotoUpdateData,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        user = get_managed_user(user_id, current_user, db)
        user.profile_photo = normalize_profile_photo(data.profile_photo)

        db.commit()
        db.refresh(user)
        return build_profile_update_response(user)
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/users/{user_id}/profile/photo")
def delete_user_profile_photo(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        user = get_managed_user(user_id, current_user, db)
        user.profile_photo = None

        db.commit()
        db.refresh(user)
        return build_profile_update_response(user)
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/favorites")
def save_favorite(
    payload: schemas.SaveFavoriteRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_matching_user(payload.user_id, current_user)
        news_id = crud.upsert_news_record(db, payload.article)

        favorite = db.query(models.Favorite).filter(
            models.Favorite.user_id == current_user.id,
            models.Favorite.news_id == news_id,
        ).first()

        if favorite is None:
            favorite = models.Favorite(
                user_id=current_user.id,
                news_id=news_id,
            )
            db.add(favorite)
        else:
            favorite.saved_at = datetime.utcnow()

        db.commit()
        return {"message": "Article saved", "news_id": news_id}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")

@app.post("/comments")
def add_comment(
    payload: schemas.CommentRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_matching_user(payload.user_id, current_user)
        cleaned_comment = payload.comment_text.strip()
        if not cleaned_comment:
            raise HTTPException(status_code=400, detail="Comment text is required")

        news_id = crud.upsert_news_record(db, payload.article)
        
        new_comment = models.Comment(
            user_id=current_user.id,
            news_id=news_id,
            comment_content=cleaned_comment
        )
        db.add(new_comment)
        db.commit()
        db.refresh(new_comment)
        
        return {"message": "Comment added", "comment_id": new_comment.comment_id, "news_id": news_id}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")

@app.delete("/favorites")
def remove_favorite(
    payload: schemas.RemoveFavoriteRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_matching_user(payload.user_id, current_user)
        if payload.news_id is not None:
            db.query(models.Favorite).filter(
                models.Favorite.user_id == current_user.id,
                models.Favorite.news_id == payload.news_id
            ).delete()
        elif payload.article_url:
            news = db.query(models.News).filter(models.News.article_url == payload.article_url).first()
            if news:
                db.query(models.Favorite).filter(
                    models.Favorite.user_id == current_user.id,
                    models.Favorite.news_id == news.id
                ).delete()
        else:
            raise HTTPException(status_code=400, detail="Provide news_id or article_url")

        db.commit()
        return {"message": "Article removed from favorites", "removed": True}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")

@app.get("/favorites-status")
def check_favorite(
    article_url: str,
    user_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_matching_user(user_id, current_user)
        news = db.query(models.News).filter(models.News.article_url == article_url).first()
        if not news:
            return {"saved": False, "news_id": None}
            
        fav = db.query(models.Favorite).filter(
            models.Favorite.user_id == current_user.id,
            models.Favorite.news_id == news.id
        ).first()
        
        return {"saved": fav is not None, "news_id": news.id if fav else None}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")

@app.get("/favorites/{user_id}")
def get_favorites(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_matching_user(user_id, current_user)
        favorites = db.query(models.Favorite).filter(models.Favorite.user_id == current_user.id).order_by(desc(models.Favorite.saved_at)).all()
        
        result = []
        for fav in favorites:
            news = fav.news
            interest_name = news.interest.name if news.interest else 'Technology'
            source_name = news.source.source_name if news.source else 'Unknown source'
            
            result.append({
                "news_id": news.id,
                "id": news.external_id or str(news.id),
                "title": news.title,
                "description": news.content or "",
                "content": news.content or "",
                "imageUrl": news.image_url or "",
                "sourceName": source_name,
                "publishedAt": news.published_at.isoformat() if news.published_at else datetime.utcnow().isoformat(),
                "url": news.article_url,
                "category": interest_name.lower(),
                "savedAt": fav.saved_at.isoformat() if fav.saved_at else None,
            })
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")

@app.get("/comments")
def get_comments(article_url: str, db: Session = Depends(database.get_db)):
    try:
        news = db.query(models.News).filter(models.News.article_url == article_url).first()
        if not news:
            return []
            
        comments = db.query(models.Comment).filter(models.Comment.news_id == news.id).order_by(desc(models.Comment.createdAt)).all()
        
        return [
            {
                "comment_id": c.comment_id,
                "comment_content": c.comment_content,
                "createdAt": c.createdAt.isoformat() if c.createdAt else None,
                "user_id": c.user_id,
                "full_name": c.user.full_name,
            }
            for c in comments
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")


@app.post("/chatbot/article-brief")
def get_article_brief(
    payload: schemas.ArticleBriefRequest,
):
    # Frontend calls this to display the small article summary above the chat.
    try:
        return get_simple_article_brief(payload.article)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot brief error: {e}")


@app.get("/chatbot/status")
def get_chatbot_status():
    # Frontend calls this to know whether Ollama + qwen3:14b are ready.
    try:
        return get_simple_chatbot_status()
    except Exception:
        raise HTTPException(status_code=500, detail="Chatbot status error.")


@app.post("/chatbot/ask")
def ask_chatbot(
    payload: schemas.AskChatbotRequest,
):
    # Main chat endpoint:
    # receive article + message + small chat history,
    # then forward everything to the simple chatbot helper.
    try:
        return ask_simple_chatbot(payload.article, payload.message, payload.history)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=500, detail=detail or "Ollama returned an error.")
    except URLError:
        raise HTTPException(status_code=503, detail=f"Ollama is not running on {OLLAMA_URL}.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot response error: {e}")
