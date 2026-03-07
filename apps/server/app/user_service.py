"""Firestore-backed user service — get or create user on Google sign-in."""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Firebase Admin SDK initialisation (runs once at import time)
# ---------------------------------------------------------------------------
_FIREBASE_APP = None
_db = None


def _init_firebase() -> None:
    """Lazily initialise the Firebase Admin SDK and Firestore client."""
    global _FIREBASE_APP, _db  # noqa: PLW0603
    if _FIREBASE_APP is not None:
        return

    # Support inline JSON from Secret Manager (FIREBASE_SERVICE_ACCOUNT_JSON env var)
    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")

    if sa_json:
        logger.info(
            "[Firebase] Initialising from FIREBASE_SERVICE_ACCOUNT_JSON env var"
        )
        sa_info = json.loads(sa_json)
        cred = credentials.Certificate(sa_info)
    elif sa_path:
        # Resolve relative paths against the directory containing this file
        resolved = Path(__file__).parent / sa_path
        logger.info(
            "[Firebase] Resolved path: %s (exists=%s)", resolved, resolved.exists()
        )
        if resolved.exists():
            cred = credentials.Certificate(str(resolved))
        else:
            # Try as absolute
            abs_path = Path(sa_path)
            if abs_path.exists():
                cred = credentials.Certificate(str(abs_path))
            else:
                raise FileNotFoundError(
                    f"Firebase service account file not found at {resolved} or {sa_path}"
                )
    else:
        logger.info(
            "[Firebase] No service account path set, using Application Default Credentials"
        )
        cred = credentials.ApplicationDefault()

    _FIREBASE_APP = firebase_admin.initialize_app(cred)
    _db = firestore.client()
    logger.info("[Firebase] Initialised (project=%s)", _FIREBASE_APP.project_id)


def _get_db():
    """Return the Firestore client, initialising if needed."""
    _init_firebase()
    return _db


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------
USERS_COLLECTION = "users"


def get_or_create_user(
    google_id: str,
    email: str,
    name: str,
    picture: str,
) -> dict:
    """Look up a user by Google ID; create a new document if not found.

    Returns a plain dict with the user's profile fields.
    """
    db = _get_db()
    doc_ref = db.collection(USERS_COLLECTION).document(google_id)
    doc = doc_ref.get()

    now = datetime.now(timezone.utc).isoformat()

    if doc.exists:
        # Update last_login timestamp
        doc_ref.update({"last_login": now})
        user_data = doc.to_dict()
        user_data["id"] = google_id
        logger.info("[UserService] Returning existing user %s <%s>", name, email)
        return user_data

    # Create new user
    user_data = {
        "google_id": google_id,
        "email": email,
        "name": name,
        "picture": picture,
        "created_at": now,
        "last_login": now,
    }
    doc_ref.set(user_data)
    user_data["id"] = google_id
    logger.info("[UserService] Created new user %s <%s>", name, email)
    return user_data
