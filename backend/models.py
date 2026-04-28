from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    profile_photo = Column(Text().with_variant(LONGTEXT(), "mysql"), nullable=True)
    role = Column(String(20), nullable=False, default="user")
    is_premium = Column(Boolean, nullable=False, default=False)
    premium_plan = Column(String(20), nullable=True)
    premium_since = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="user", cascade="all, delete-orphan")
    interests = relationship("Interest", secondary="user_interests", back_populates="users")
    live_events = relationship("LiveEvent", back_populates="editor")
    live_messages = relationship("LiveMessage", back_populates="user", cascade="all, delete-orphan")

class Interest(Base):
    __tablename__ = "interests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)

    users = relationship("User", secondary="user_interests", back_populates="interests")
    news_articles = relationship("News", back_populates="interest", cascade="all, delete-orphan")

class UserInterest(Base):
    __tablename__ = "user_interests"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    interest_id = Column(Integer, ForeignKey("interests.id", ondelete="CASCADE"), primary_key=True)

class Source(Base):
    __tablename__ = "source"

    id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String(100), nullable=False)
    source_url = Column(String(255))
    
    __table_args__ = (UniqueConstraint('source_name', 'source_url', name='uq_source_name_url'),)

    news_articles = relationship("News", back_populates="source", cascade="all, delete-orphan")

class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(255))
    title = Column(String(255), nullable=False)
    content = Column(Text)
    image_url = Column(String(255))
    article_url = Column(String(500), unique=True, nullable=False)
    published_at = Column(DateTime)
    interest_id = Column(Integer, ForeignKey("interests.id", ondelete="SET NULL"))
    source_id = Column(Integer, ForeignKey("source.id", ondelete="SET NULL"))
    datatype = Column(String(50))
    country = Column(String(10))

    interest = relationship("Interest", back_populates="news_articles")
    source = relationship("Source", back_populates="news_articles")
    favorites = relationship("Favorite", back_populates="news", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="news", cascade="all, delete-orphan")

class Favorite(Base):
    __tablename__ = "favorite"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    news_id = Column(Integer, ForeignKey("news.id", ondelete="CASCADE"), primary_key=True)
    saved_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="favorites")
    news = relationship("News", back_populates="favorites")

class Comment(Base):
    __tablename__ = "comments"

    comment_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    news_id = Column(Integer, ForeignKey("news.id", ondelete="CASCADE"), nullable=False)
    comment_content = Column(Text, nullable=False)
    createdAt = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="comments")
    news = relationship("News", back_populates="comments")


class LiveEvent(Base):
    __tablename__ = "live_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)
    cover_image = Column(String(500), nullable=True)
    stream_url = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="upcoming")
    premium_only = Column(Boolean, nullable=False, default=True)
    editor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    editor = relationship("User", back_populates="live_events")
    messages = relationship("LiveMessage", back_populates="live_event", cascade="all, delete-orphan")


class LiveMessage(Base):
    __tablename__ = "live_messages"

    id = Column(Integer, primary_key=True, index=True)
    live_event_id = Column(Integer, ForeignKey("live_events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_type = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    live_event = relationship("LiveEvent", back_populates="messages")
    user = relationship("User", back_populates="live_messages")
