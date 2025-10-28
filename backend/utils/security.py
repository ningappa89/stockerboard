from passlib.context import CryptContext
from jose import jwt
import time

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET = "CHANGE_THIS_TO_ENV_SECRET"
ALGORITHM = "HS256"
ACCESS_EXPIRE_SECONDS = 60*60*24*7

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": time.time() + ACCESS_EXPIRE_SECONDS})
    return jwt.encode(to_encode, SECRET, algorithm=ALGORITHM)
