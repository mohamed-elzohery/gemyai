"""Authentication utilities — Google ID token verification, JWT session cookies."""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi import HTTPException, Request, WebSocket

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config (loaded from environment)
# ---------------------------------------------------------------------------
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7
COOKIE_NAME = "session_token"


# ---------------------------------------------------------------------------
# Google ID-token verification
# ---------------------------------------------------------------------------


def verify_google_token(token: str) -> dict:
    """Verify a Google ID token (from @react-oauth/google credential).

    Returns the decoded payload containing sub, email, name, picture, etc.
    Raises HTTPException(401) on failure.
    """
    if not GOOGLE_OAUTH_CLIENT_ID:
        logger.error("GOOGLE_OAUTH_CLIENT_ID is not set in environment")
        raise HTTPException(status_code=500, detail="OAuth not configured")

    logger.info("Verifying Google token against client_id=...%s", GOOGLE_OAUTH_CLIENT_ID[-12:])
    try:
        idinfo = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_OAUTH_CLIENT_ID,
        )
        # Verify issuer
        if idinfo["iss"] not in ("accounts.google.com", "https://accounts.google.com"):
            raise ValueError("Invalid issuer")
        logger.info("Google token verified for %s", idinfo.get("email"))
        return idinfo
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {exc}") from exc


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_jwt(user_id: str, email: str, name: str, picture: str) -> str:
    """Create an HS256 JWT containing essential user claims."""
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> dict:
    """Decode and verify a session JWT.  Returns the claims dict."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def _extract_cookie_token(cookies: dict) -> str:
    """Extract the session cookie or raise 401."""
    token = cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def get_current_user(request: Request) -> dict:
    """FastAPI dependency — returns the current user from cookie JWT."""
    token = _extract_cookie_token(request.cookies)
    return verify_jwt(token)


def get_ws_user(websocket: WebSocket) -> Optional[dict]:
    """Extract and verify user from WebSocket cookies.

    Returns the user claims dict, or None if no valid cookie is present.
    """
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
