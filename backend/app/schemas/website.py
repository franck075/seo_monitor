from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WebsiteCreate(BaseModel):
    domain: str
    display_name: Optional[str] = None
    gsc_property: Optional[str] = None
    ga4_property_id: Optional[str] = None
    gsc_cred_id: Optional[int] = None
    ga4_cred_id: Optional[int] = None
    timezone: str = "UTC"

class WebsiteUpdate(BaseModel):
    display_name: Optional[str] = None
    gsc_property: Optional[str] = None
    ga4_property_id: Optional[str] = None
    gsc_cred_id: Optional[int] = None
    ga4_cred_id: Optional[int] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None

class WebsiteOut(BaseModel):
    id: int
    domain: str
    display_name: Optional[str]
    gsc_property: Optional[str]
    ga4_property_id: Optional[str]
    timezone: str
    is_active: bool
    health_score: int
    created_at: datetime
    model_config = {"from_attributes": True}
