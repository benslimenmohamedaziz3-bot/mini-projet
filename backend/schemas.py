from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SignupData(BaseModel):
    full_name: str
    email: str
    password: str
    interest_ids: List[int]

class LoginData(BaseModel):
    email: str
    password: str


class ProfileDetailsUpdateData(BaseModel):
    full_name: str
    email: str
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class ProfilePhotoUpdateData(BaseModel):
    profile_photo: str

class FavoriteArticleData(BaseModel):
    article_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    source_url: str
    source_name: Optional[str] = None
    published_at: Optional[str] = None
    category: Optional[str] = None
    datatype: Optional[str] = None
    country: Optional[str] = None

class SaveFavoriteRequest(BaseModel):
    user_id: Optional[int] = None
    article: FavoriteArticleData

class RemoveFavoriteRequest(BaseModel):
    user_id: Optional[int] = None
    news_id: Optional[int] = None
    article_url: Optional[str] = None

class CommentRequest(BaseModel):
    user_id: Optional[int] = None
    article: FavoriteArticleData
    comment_text: str


# One previous chat message sent by the frontend.
# `mode` tells us whether the message came from normal chat or article-grounded chat.
class ChatTurnData(BaseModel):
    role: str
    content: str
    mode: Optional[str] = "general"


# Request body for the small article summary endpoint.
class ArticleBriefRequest(BaseModel):
    article: FavoriteArticleData


# Request body for the main chatbot endpoint.
# It includes the article, the current user message, and a short history.
class AskChatbotRequest(BaseModel):
    article: FavoriteArticleData
    message: str
    history: List[ChatTurnData] = []

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    profile_photo: Optional[str] = None
    interests: List[str] = []

    class Config:
        from_attributes = True

class InterestResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
