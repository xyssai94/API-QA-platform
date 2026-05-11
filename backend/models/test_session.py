from sqlalchemy import Column, Integer, Text, DateTime, func
from database import Base


class TestSession(Base):
    __tablename__ = "test_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(Text, nullable=False)       # single | batch | compare | perf
    name = Column(Text)
    preset_ids = Column(Text)                 # JSON 数组
    status = Column(Text, default="running")  # running | done | error
    created_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime)
