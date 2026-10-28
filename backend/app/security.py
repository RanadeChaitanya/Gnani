"""JWT participant tokens, room codes, in-memory rate limiter."""
import secrets
import time
from dataclasses import dataclass

import jwt

from .config import get_settings

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
TOKEN_TTL_S = 3 * 3600


def new_room_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


@dataclass
class Claims:
    room_id: str
    participant_id: str
    role: str


def issue_token(room_id: str, participant_id: str, role: str) -> str:
    payload = {"room_id": room_id, "participant_id": participant_id, "role": role,
               "exp": int(time.time()) + TOKEN_TTL_S}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def verify_token(token: str) -> Claims | None:
    try:
        p = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return Claims(p["room_id"], p["participant_id"], p["role"])
    except (jwt.PyJWTError, KeyError):
        return None


class RateLimiter:
    """Token bucket per key: `per_min` requests per minute."""

    def __init__(self, per_min: int) -> None:
        self.rate = per_min / 60.0
        self.cap = float(per_min)
        self.buckets: dict[str, tuple[float, float]] = {}

    def allow(self, key: str) -> bool:
        t = time.monotonic()
        tokens, last = self.buckets.get(key, (self.cap, t))
        tokens = min(self.cap, tokens + (t - last) * self.rate)
        if tokens < 1:
            self.buckets[key] = (tokens, t)
            return False
        self.buckets[key] = (tokens - 1, t)
        return True
