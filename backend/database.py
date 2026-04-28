import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, make_url
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

def _read_mysql_port() -> int:
    try:
        return int(os.getenv("MYSQL_PORT", "3306"))
    except ValueError:
        return 3306


def _build_database_url() -> URL:
    configured_url = os.getenv("DATABASE_URL")
    if configured_url:
        database_url = make_url(configured_url)
    else:
        database_url = URL.create(
            "mysql+pymysql",
            username=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", "") or None,
            host=os.getenv("MYSQL_HOST", "localhost"),
            port=_read_mysql_port(),
            database=os.getenv("MYSQL_DATABASE", "newshub1"),
            query={"charset": "utf8mb4"},
        )

    if database_url.get_backend_name() != "mysql":
        raise ValueError("DATABASE_URL must point to a MySQL database.")

    return database_url


def _ensure_database_exists(database_url: URL) -> None:
    if not database_url.database:
        return

    server_url = database_url.set(database=None)
    temporary_engine = create_engine(server_url, pool_pre_ping=True)
    database_name = database_url.database.replace("`", "``")

    try:
        with temporary_engine.begin() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{database_name}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
    finally:
        temporary_engine.dispose()


SQLALCHEMY_DATABASE_URL = _build_database_url()
_ensure_database_exists(SQLALCHEMY_DATABASE_URL)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
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
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN profile_photo LONGTEXT NULL"))
    if "role" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"))
    if "is_premium" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE"))
    if "premium_plan" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN premium_plan VARCHAR(20) NULL"))
    if "premium_since" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN premium_since DATETIME NULL"))

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
