from collections import defaultdict
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Depends, Query, WebSocket, WebSocketDisconnect
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
        "role": user.role or "user",
        "is_premium": bool(user.is_premium),
        "premium_plan": user.premium_plan,
        "premium_since": user.premium_since.isoformat() if user.premium_since else None,
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


def get_current_user_from_token(token: str, db: Session) -> models.User:
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    user_id = payload.get("user_id")
    email = payload.get("sub")
    user = find_or_create_user_from_token(db, user_id, email)
    if user is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    return user


def ensure_matching_user(user_id: Optional[int], current_user: models.User) -> None:
    if user_id is not None and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not allowed to access this resource.")


def ensure_editor(current_user: models.User) -> None:
    if (current_user.role or "user") != "editor":
        raise HTTPException(status_code=403, detail="Editor access is required for this action.")


def ensure_live_room_editor(live_event: models.LiveEvent, current_user: models.User) -> None:
    ensure_editor(current_user)
    if live_event.editor_user_id and live_event.editor_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="This live room belongs to another editor.")


def can_access_live_event(live_event: models.LiveEvent, current_user: models.User) -> bool:
    is_room_editor = live_event.editor_user_id == current_user.id and (current_user.role or "user") == "editor"
    if is_room_editor:
        return True

    if live_event.premium_only:
        return bool(current_user.is_premium)

    return True


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


def build_auth_response(user: models.User, message: str) -> dict:
    return {
        "message": message,
        "access_token": create_user_access_token(user),
        "token_type": "bearer",
        "user": serialize_user(user),
    }


def serialize_live_message(message: models.LiveMessage) -> dict:
    return {
        "id": message.id,
        "message_type": message.message_type,
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "user_id": message.user_id,
        "user_name": message.user.full_name if message.user else "NewsHub member",
    }


class LiveRoomManager:
    def __init__(self) -> None:
        self.connections: dict[int, dict[str, dict]] = defaultdict(dict)

    async def connect(self, room_id: int, websocket: WebSocket, user: models.User) -> str:
        client_id = str(uuid4())
        self.connections[room_id][client_id] = {
            "socket": websocket,
            "user_id": user.id,
            "role": user.role or "user",
        }
        return client_id

    def disconnect(self, room_id: int, client_id: str) -> None:
        room_connections = self.connections.get(room_id)
        if room_connections is None:
            return

        room_connections.pop(client_id, None)
        if not room_connections:
            self.connections.pop(room_id, None)

    def get_viewer_count(self, room_id: int) -> int:
        return len(self.connections.get(room_id, {}))

    async def broadcast(self, room_id: int, payload: dict, exclude_client_id: Optional[str] = None) -> None:
        room_connections = self.connections.get(room_id, {})
        disconnected_clients: list[str] = []

        for client_id, connection in room_connections.items():
            if exclude_client_id and client_id == exclude_client_id:
                continue

            try:
                await connection["socket"].send_json(payload)
            except Exception:
                disconnected_clients.append(client_id)

        for client_id in disconnected_clients:
            self.disconnect(room_id, client_id)

    async def send_to_client(self, room_id: int, client_id: str, payload: dict) -> None:
        room_connections = self.connections.get(room_id, {})
        target = room_connections.get(client_id)
        if not target:
            return

        try:
            await target["socket"].send_json(payload)
        except Exception:
            self.disconnect(room_id, client_id)

    async def broadcast_viewer_count(self, room_id: int) -> None:
        await self.broadcast(
            room_id,
            {
                "type": "viewer_count",
                "viewerCount": self.get_viewer_count(room_id),
            },
        )


live_room_manager = LiveRoomManager()


def serialize_live_event(event: models.LiveEvent, viewer_count: int = 0) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "category": event.category,
        "cover_image": event.cover_image,
        "stream_url": event.stream_url,
        "status": event.status,
        "premium_only": bool(event.premium_only),
        "viewer_count": viewer_count,
        "editor_user_id": event.editor_user_id,
        "editor_name": event.editor.full_name if event.editor else None,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "started_at": event.started_at.isoformat() if event.started_at else None,
        "ended_at": event.ended_at.isoformat() if event.ended_at else None,
    }


def serialize_live_event_detail(event: models.LiveEvent) -> dict:
    updates = [
        serialize_live_message(message)
        for message in event.messages
        if message.message_type == "update"
    ]
    chat_messages = [
        serialize_live_message(message)
        for message in event.messages
        if message.message_type == "chat"
    ]

    return {
        **serialize_live_event(event, viewer_count=live_room_manager.get_viewer_count(event.id)),
        "updates": updates[-30:],
        "chat_messages": chat_messages[-40:],
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


@app.post("/premium/activate")
def activate_premium_membership(
    payload: schemas.PremiumActivationRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        selected_plan = payload.plan.strip().lower()
        if selected_plan not in {"monthly", "annual"}:
            raise HTTPException(status_code=400, detail="Please choose a valid premium plan.")

        current_user.is_premium = True
        current_user.premium_plan = selected_plan
        current_user.premium_since = current_user.premium_since or datetime.utcnow()

        db.commit()
        db.refresh(current_user)
        return build_auth_response(
            current_user,
            "Premium access has been activated in simulation mode.",
        )
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Premium activation failed: {exc}")


@app.get("/live-events")
def list_live_events(db: Session = Depends(database.get_db)):
    events = (
        db.query(models.LiveEvent)
        .order_by(
            desc(models.LiveEvent.status == "live"),
            desc(models.LiveEvent.created_at),
        )
        .all()
    )

    return [
        serialize_live_event(event, viewer_count=live_room_manager.get_viewer_count(event.id))
        for event in events
    ]


@app.get("/live-events/{event_id}")
def get_live_event(event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.LiveEvent).filter(models.LiveEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Live event not found.")

    return serialize_live_event_detail(event)


@app.post("/live-events")
def create_live_event(
    payload: schemas.CreateLiveEventRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ensure_editor(current_user)

        title = payload.title.strip()
        description = payload.description.strip()
        category = payload.category.strip().lower()

        if not title:
            raise HTTPException(status_code=400, detail="A live room title is required.")
        if not description:
            raise HTTPException(status_code=400, detail="A live room description is required.")
        if not category:
            raise HTTPException(status_code=400, detail="A category is required.")

        live_event = models.LiveEvent(
            title=title,
            description=description,
            category=category,
            cover_image=payload.cover_image.strip() if payload.cover_image else None,
            stream_url=payload.stream_url.strip() if payload.stream_url else None,
            premium_only=payload.premium_only,
            editor_user_id=current_user.id,
            status="upcoming",
        )

        db.add(live_event)
        db.commit()
        db.refresh(live_event)
        return serialize_live_event(live_event)
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Live room creation failed: {exc}")


@app.post("/live-events/{event_id}/start")
async def start_live_event(
    event_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        event = db.query(models.LiveEvent).filter(models.LiveEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Live event not found.")

        ensure_live_room_editor(event, current_user)

        event.status = "live"
        event.started_at = datetime.utcnow()
        event.ended_at = None

        db.commit()
        db.refresh(event)

        await live_room_manager.broadcast(
            event.id,
            {
                "type": "room_status",
                "status": event.status,
            },
        )
        return serialize_live_event(event, viewer_count=live_room_manager.get_viewer_count(event.id))
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unable to start the live room: {exc}")


@app.post("/live-events/{event_id}/end")
async def end_live_event(
    event_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        event = db.query(models.LiveEvent).filter(models.LiveEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Live event not found.")

        ensure_live_room_editor(event, current_user)

        event.status = "ended"
        event.ended_at = datetime.utcnow()

        db.commit()
        db.refresh(event)

        await live_room_manager.broadcast(
            event.id,
            {
                "type": "room_status",
                "status": event.status,
            },
        )
        await live_room_manager.broadcast(
            event.id,
            {
                "type": "stream_ended",
            },
        )
        return serialize_live_event(event, viewer_count=live_room_manager.get_viewer_count(event.id))
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unable to end the live room: {exc}")


@app.delete("/live-events/{event_id}")
def delete_live_event(
    event_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        event = db.query(models.LiveEvent).filter(models.LiveEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Live event not found.")

        ensure_live_room_editor(event, current_user)

        db.delete(event)
        db.commit()
        live_room_manager.connections.pop(event_id, None)

        return {"message": "Live room deleted successfully."}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unable to delete the live room: {exc}")


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

        normalized_email = data.email.strip().lower()
        existing_user = db.query(models.User).filter(
            func.lower(models.User.email) == normalized_email
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="This account already exists.")

        # 1. Insert User
        new_user = models.User(
            full_name=data.full_name.strip(),
            email=normalized_email,
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
        response = build_auth_response(new_user, "Signup complete")
        response["user_id"] = new_user.id
        return response
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
        normalized_email = email.strip().lower()
        user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
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

        return build_auth_response(user, "Login successful")
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


@app.websocket("/ws/live-events/{event_id}")
async def live_event_socket(
    websocket: WebSocket,
    event_id: int,
    token: str = Query(default=""),
):
    db = database.SessionLocal()
    client_id: Optional[str] = None
    room_id = event_id

    try:
        if not token:
            await websocket.close(code=4401)
            return

        current_user = get_current_user_from_token(token, db)
        live_event = db.query(models.LiveEvent).filter(models.LiveEvent.id == event_id).first()

        if not live_event:
            await websocket.close(code=4404)
            return

        if not can_access_live_event(live_event, current_user):
            await websocket.close(code=4403)
            return

        await websocket.accept()
        client_id = await live_room_manager.connect(room_id, websocket, current_user)

        await websocket.send_json(
            {
                "type": "socket_ready",
                "clientId": client_id,
                "viewerCount": live_room_manager.get_viewer_count(room_id),
                "status": live_event.status,
                "isEditor": live_event.editor_user_id == current_user.id and (current_user.role or "user") == "editor",
            }
        )
        await live_room_manager.broadcast_viewer_count(room_id)

        while True:
            payload = await websocket.receive_json()
            message_type = str(payload.get("type", "")).strip()

            if message_type == "chat_message":
                content = str(payload.get("content", "")).strip()
                if not content:
                    continue

                live_message = models.LiveMessage(
                    live_event_id=live_event.id,
                    user_id=current_user.id,
                    message_type="chat",
                    content=content,
                )
                db.add(live_message)
                db.commit()
                db.refresh(live_message)
                live_message.user = current_user

                await live_room_manager.broadcast(
                    room_id,
                    {
                        "type": "chat_message",
                        "message": serialize_live_message(live_message),
                    },
                )
                continue

            if message_type == "live_update":
                ensure_live_room_editor(live_event, current_user)
                content = str(payload.get("content", "")).strip()
                if not content:
                    continue

                live_message = models.LiveMessage(
                    live_event_id=live_event.id,
                    user_id=current_user.id,
                    message_type="update",
                    content=content,
                )
                db.add(live_message)
                db.commit()
                db.refresh(live_message)
                live_message.user = current_user

                await live_room_manager.broadcast(
                    room_id,
                    {
                        "type": "live_update",
                        "message": serialize_live_message(live_message),
                    },
                )
                continue

            if message_type == "broadcaster_ready":
                ensure_live_room_editor(live_event, current_user)
                await live_room_manager.broadcast(
                    room_id,
                    {
                        "type": "broadcaster_ready",
                        "senderClientId": client_id,
                    },
                    exclude_client_id=client_id,
                )
                continue

            if message_type == "stream_ended":
                ensure_live_room_editor(live_event, current_user)
                await live_room_manager.broadcast(
                    room_id,
                    {
                        "type": "stream_ended",
                    },
                )
                continue

            if message_type in {"viewer_joined", "offer", "answer", "ice_candidate"}:
                outgoing_payload = {
                    "type": message_type,
                    "senderClientId": client_id,
                }

                if message_type in {"offer", "answer"}:
                    outgoing_payload["sdp"] = payload.get("sdp")

                if message_type == "ice_candidate":
                    outgoing_payload["candidate"] = payload.get("candidate")

                target_client_id = payload.get("targetClientId")
                if target_client_id:
                    await live_room_manager.send_to_client(room_id, str(target_client_id), outgoing_payload)
                else:
                    await live_room_manager.broadcast(
                        room_id,
                        outgoing_payload,
                        exclude_client_id=client_id,
                    )
    except WebSocketDisconnect:
        pass
    finally:
        if client_id is not None:
            live_room_manager.disconnect(room_id, client_id)
            await live_room_manager.broadcast_viewer_count(room_id)
        db.close()


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
