from sqlalchemy import Column, Integer, Text, DateTime, func
from database import Base


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_name = Column(Text)
    tags = Column(Text)                       # JSON 数组
    name = Column(Text, nullable=False)
    messages = Column(Text, nullable=False)   # JSON messages 数组
    attachments = Column(Text)                # JSON 多模态输入
    expected = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
