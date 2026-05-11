from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "qa.db")
DB_URL = f"sqlite:///{os.path.abspath(DB_PATH)}"

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import endpoint, preset, test_case, test_session, test_result  # noqa
    Base.metadata.create_all(bind=engine)
