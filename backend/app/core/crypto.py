import base64
import json
from cryptography.fernet import Fernet
from app.config import settings

def _get_fernet() -> Fernet:
    key = settings.CREDENTIALS_ENCRYPTION_KEY.encode()
    key_bytes = base64.urlsafe_b64decode(key + b"=" * (4 - len(key) % 4))[:32]
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)

def encrypt_credentials(data: dict) -> str:
    f = _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()

def decrypt_credentials(encrypted: str) -> dict:
    f = _get_fernet()
    return json.loads(f.decrypt(encrypted.encode()).decode())
