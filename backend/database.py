import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

DEFAULT_INTERESTS = (
    "Technology",
    "Business",
    "Politics",
    "Science",
    "Entertainment",
    "Sports",
    "Health",
)

DEFAULT_SQLITE_PATH = Path(__file__).resolve().with_name("newshub.db")
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
IS_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

engine_kwargs = {
    "pool_pre_ping": True,
}

if IS_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_schema_extensions():
    import models

    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        inspector = inspect(engine)

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    if "profile_photo" not in existing_columns:
        column_type = "TEXT" if IS_SQLITE else "LONGTEXT"
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN profile_photo {column_type} NULL"))

    with SessionLocal() as session:
        if session.query(models.Interest).count() == 0:
            session.add_all(models.Interest(name=name) for name in DEFAULT_INTERESTS)
            session.commit()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
