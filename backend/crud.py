from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional

import models, schemas

def parse_publication_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    safe_value = value.strip()
    if not safe_value:
        return None
    if safe_value.endswith("Z"):
        safe_value = safe_value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(safe_value)
        return parsed.replace(tzinfo=None)
    except ValueError:
        return None

def get_or_create_interest_id(db: Session, category: Optional[str]) -> Optional[int]:
    if not category:
        return None
    normalized = category.strip()
    if not normalized:
        return None
        
    existing = db.query(models.Interest).filter(func.lower(models.Interest.name) == normalized.lower()).first()
    if existing:
        return existing.id
        
    display_name = normalized[0].upper() + normalized[1:].lower() if len(normalized) > 1 else normalized.upper()
    new_interest = models.Interest(name=display_name)
    db.add(new_interest)
    db.commit()
    db.refresh(new_interest)
    return new_interest.id

def upsert_news_record(db: Session, article: schemas.FavoriteArticleData) -> int:
    article_url = (article.source_url or "").strip()
    if not article_url:
        raise ValueError("Article URL is required")

    source_name = (article.source_name or "Unknown source").strip() or "Unknown source"

    source = db.query(models.Source).filter_by(source_name=source_name, source_url=article_url).first()
    if source is None:
        source = models.Source(
            source_name=source_name,
            source_url=article_url,
        )
        db.add(source)
        db.flush()

    interest_id = get_or_create_interest_id(db, article.category)
    published_at = parse_publication_date(article.published_at)
    article_content = article.content or article.description

    news = db.query(models.News).filter_by(article_url=article_url).first()
    if news is None:
        news = models.News(article_url=article_url)
        db.add(news)

    news.external_id = article.article_id
    news.title = article.title
    news.content = article_content
    news.image_url = article.image_url
    news.published_at = published_at
    news.interest_id = interest_id
    news.source_id = source.id
    news.datatype = article.datatype
    news.country = article.country

    db.flush()
    return news.id
