"""All runtime settings, loaded from env / .env (see .env.example)."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    app_env: str = "dev"
    public_base_url: str = "http://localhost:8000"
    jwt_secret: str = "change-me"
    demo_mode: bool = True
    server_retention_hours: float = 24
    database_url: str = f"sqlite:///{ROOT / 'data' / 'saar.db'}"
    log_level: str = "INFO"
    log_transcripts: bool = False

    gnani_api_key: str = ""
    gnani_stt_ws_url: str = "wss://api.vachana.ai/stt/v3/stream"
    gnani_base_url: str = "https://api.vachana.ai"
    stt_vad_threshold: float = 0.5
    stt_min_silence_ms: int = 700
    stt_min_speech_ms: int = 100
    stt_min_segment_ms: int = 120
    stt_max_speech_s: float | None = None
    stt_format_default: str = "transcribe"
    stt_model: str = "prisma-v3.0"  # "" → Prisma v2.5 (old header set)
    stt_partials: bool = True  # verified live 2026-10-28: partial_transcript + final_transcript
    max_stt_seconds_per_room: float = 1800
    gnani_ws_url_override: str = ""

    call_audio_provider: str = "livekit"
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    llm_provider: str = "openai_compat"
    llm_model: str = "deepseek-chat"
    openai_compat_base_url: str = "https://api.deepseek.com"
    openai_compat_api_key: str = ""
    # Hard spend cap across app + smoke + eval (ledger in data/llm_spend.json). Prices deliberately above
    # DeepSeek's list prices so the estimate can only over-count.
    llm_budget_usd: float = 0.20
    llm_price_in_per_m: float = 0.60
    llm_price_out_per_m: float = 2.20
    llm_ledger_path: str = str(ROOT / "data" / "llm_spend.json")
    max_transcript_chars: int = 60000
    note_max_tokens: int = 1500

    # Notion export: an internal integration token + the page it may write under (shared with the integration)
    notion_token: str = ""
    notion_parent_page_id: str = ""

    echo_dedupe: bool = True
    mic_aec: bool = True
    mic_ns: bool = True
    mic_agc: bool = True
    rate_limit_per_min: int = 20

    @field_validator("stt_max_speech_s", mode="before")
    @classmethod
    def _empty_none(cls, v: object) -> object:
        return None if v == "" else v

    @property
    def stt_url(self) -> str:
        return self.gnani_ws_url_override or self.gnani_stt_ws_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
