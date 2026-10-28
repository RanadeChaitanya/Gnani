"""Call-audio credentials (§8.5): LiveKit token minting, or none (tests / solo)."""
from datetime import timedelta

from .config import get_settings


def create_credentials(room_code: str, participant_id: str, display_name: str) -> dict[str, str] | None:
    """Return {url, token} for the WebRTC call, or None when the call is disabled."""
    s = get_settings()
    if s.call_audio_provider != "livekit" or not (s.livekit_url and s.livekit_api_key):
        return None
    from livekit import api as lk

    token = (lk.AccessToken(s.livekit_api_key, s.livekit_api_secret)
             .with_identity(participant_id).with_name(display_name)
             .with_grants(lk.VideoGrants(room_join=True, room=room_code, can_publish=True, can_subscribe=True,
                                         can_publish_sources=["microphone"]))
             .with_ttl(timedelta(hours=3)).to_jwt())
    return {"url": s.livekit_url, "token": token}
