from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    plan: Optional[str] = "starter"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    plan: str = "starter"
    is_active: bool
    telegram_chat_id: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RegisterResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class CredentialCreate(BaseModel):
    provider: str
    label: Optional[str] = None
    credentials_json: dict

class CredentialOut(BaseModel):
    id: int
    provider: str
    label: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}
