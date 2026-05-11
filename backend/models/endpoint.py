from sqlalchemy import Column, Integer, Text, DateTime, func
from database import Base


class Endpoint(Base):
    __tablename__ = "endpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    protocol = Column(Text, nullable=False)   # openai_cc | anthropic | openai_resp | gemini
    base_url = Column(Text, nullable=False)
    api_key = Column(Text)
    extra_headers = Column(Text)              # JSON
    proxy = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
