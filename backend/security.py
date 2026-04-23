import os
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from typing import Optional

try:
    import bcrypt  # type: ignore
except ImportError:  # pragma: no cover - fallback used only when bcrypt is missing
    bcrypt = None
try:
    from jose import JWTError, jwt  # type: ignore
except ImportError:  # pragma: no cover - fallback used only when python-jose is missing
    class JWTError(Exception):
        pass

    def _b64url_encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")

    def _b64url_decode(value: str) -> bytes:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode((value + padding).encode("utf-8"))

    class _SimpleJWT:
        @staticmethod
        def encode(payload: dict, secret: str, algorithm: str = "HS256") -> str:
            if algorithm != "HS256":
                raise JWTError("Only HS256 is supported by the fallback JWT encoder.")

            header = {"alg": algorithm, "typ": "JWT"}
            header_text = _b64url_encode(
                json.dumps(header, separators=(",", ":"), default=str).encode("utf-8")
            )
            payload_text = _b64url_encode(
                json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
            )
            signing_input = f"{header_text}.{payload_text}".encode("utf-8")
            signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
            return f"{header_text}.{payload_text}.{_b64url_encode(signature)}"

        @staticmethod
        def decode(token: str, secret: str, algorithms: list[str] | None = None) -> dict:
            allowed = algorithms or ["HS256"]
            if "HS256" not in allowed:
                raise JWTError("Only HS256 is supported by the fallback JWT decoder.")

            try:
                header_text, payload_text, signature_text = token.split(".")
            except ValueError as exc:
                raise JWTError("Invalid token format.") from exc

            signing_input = f"{header_text}.{payload_text}".encode("utf-8")
            expected_signature = hmac.new(
                secret.encode("utf-8"),
                signing_input,
                hashlib.sha256,
            ).digest()
            given_signature = _b64url_decode(signature_text)

            if not hmac.compare_digest(expected_signature, given_signature):
                raise JWTError("Invalid token signature.")

            try:
                payload = json.loads(_b64url_decode(payload_text).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise JWTError("Invalid token payload.") from exc

            exp = payload.get("exp")
            if exp is not None:
                if isinstance(exp, str):
                    expiration_time = datetime.fromisoformat(exp)
                else:
                    expiration_time = datetime.utcfromtimestamp(exp)
                if expiration_time < datetime.utcnow():
                    raise JWTError("Token expired.")

            return payload

    jwt = _SimpleJWT()


def _read_access_token_expiry_minutes() -> int:
    configured_value = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    try:
        return max(1, int(configured_value))
    except ValueError:
        return 1440


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = _read_access_token_expiry_minutes()


def _hash_password_with_pbkdf2(password: str) -> str:
    iterations = 600_000
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    salt_text = base64.b64encode(salt).decode("utf-8")
    digest_text = base64.b64encode(digest).decode("utf-8")
    return f"pbkdf2_sha256${iterations}${salt_text}${digest_text}"


def _verify_password_with_pbkdf2(password: str, password_hash: str) -> bool:
    try:
        _, iterations_text, salt_text, digest_text = password_hash.split("$", 3)
        iterations = int(iterations_text)
        salt = base64.b64decode(salt_text.encode("utf-8"))
        expected_digest = base64.b64decode(digest_text.encode("utf-8"))
    except (ValueError, TypeError):
        return False

    candidate_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate_digest, expected_digest)


def hash_password(password: str) -> str:
    if bcrypt is not None:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    return _hash_password_with_pbkdf2(password)


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("pbkdf2_sha256$"):
        return _verify_password_with_pbkdf2(password, password_hash)

    if bcrypt is not None:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

    return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expiration_time = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expiration_time})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
