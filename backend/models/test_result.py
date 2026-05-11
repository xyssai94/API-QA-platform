from sqlalchemy import Column, Integer, Text, Float, DateTime, ForeignKey, func
from database import Base


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("test_sessions.id"))
    test_case_id = Column(Integer, ForeignKey("test_cases.id"))
    preset_id = Column(Integer, ForeignKey("presets.id"))
    request_snapshot = Column(Text, nullable=False)   # JSON 实际发送的请求
    response_text = Column(Text)
    thinking_text = Column(Text)
    ttft_ms = Column(Float)
    total_ms = Column(Float)
    input_tokens = Column(Integer)
    output_tokens = Column(Integer)
    cache_read_tokens = Column(Integer)
    cache_write_tokens = Column(Integer)
    reasoning_tokens = Column(Integer)
    tokens_per_second = Column(Float)
    score = Column(Integer)
    note = Column(Text)
    status = Column(Text, default="ok")       # ok | error | timeout
    error_msg = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
