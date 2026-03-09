from sqlalchemy import Column, String, Text, DateTime
from datetime import datetime, timezone

from app.database import Base


class SettingModel(Base):
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ModelCapabilityModel(Base):
    __tablename__ = "model_capabilities"

    model_name = Column(String(200), primary_key=True)
    capabilities = Column(Text, nullable=False, default="chat")
    default_for = Column(Text, nullable=False, default="")
    temperature = Column(String(10), default="0.7")
    context_length = Column(String(10), default="4096")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
