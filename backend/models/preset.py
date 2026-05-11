from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, func
from database import Base


class Preset(Base):
    __tablename__ = "presets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    endpoint_id = Column(Integer, ForeignKey("endpoints.id"))
    model = Column(Text, nullable=False)
    params = Column(Text, nullable=False)     # JSON
    system_prompt = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
