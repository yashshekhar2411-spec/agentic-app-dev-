import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, wherever the server is started from
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
# Where the server saves its JSON data (contacts, roles, team, ...): backend/ by default. In the cloud, DATA_DIR
# points at a persistent disk so redeploys and restarts keep the data.
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parents[2])


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Server
    public_base_url: str = "http://localhost:8000"  # public URL Twilio calls back (e.g. your ngrok URL)
    cors_origins: str = "*"
    log_level: str = "INFO"
    # Agents sign in with Firebase Auth; the API accepts their ID tokens for this project.
    firebase_project_id: str = ""
    # Shared secret for scripts / server-to-server calls (Authorization: Bearer <token>).
    # With neither this nor firebase_project_id set, the API is open (dev only).
    api_token: str = ""
    # Comma-separated emails that are always super admins (besides the first person to sign up)
    super_admin_emails: str = ""
    enable_simulator: bool = True  # text-driven test calls; turn off in production

    # Storage. Empty URLs = everything in memory (single process, lost on restart: dev and tests only).
    database_url: str = ""  # PostgreSQL, e.g. postgresql://user:password@localhost:5432/agentic
    redis_url: str = ""  # Redis, e.g. rediss://default:password@host:6379
    db_pool_max: int = 10  # connections per server process
    history_limit: int = 200  # calls / handoffs returned by lists and the app's live snapshot
    conversation_ttl_s: int = 3 * 3600  # AI state of a call is dropped from Redis after this long
    max_finished_calls: int = 500  # memory mode only: older ended calls are dropped
    # Memory mode only: team members and their roles are also saved here so a restart doesn't lose them
    # ("" = don't save). Relative paths are inside DATA_DIR.
    humans_file: str = "humans.json"

    # Company / persona
    company_name: str = "Acme Support"
    call_language: str = "en-IN"  # Twilio speech recognition language
    tts_voice: str = "Polly.Aditi"  # Twilio <Say> voice
    custom_greeting: str = ""  # replaces the default inbound greeting when set

    # LLM
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "low"  # low keeps phone replies fast
    agent_turn_timeout_s: float = 12.0  # Twilio webhooks time out at 15s
    max_tool_rounds: int = 4

    # Handoff policy
    max_failed_turns: int = 3  # silence / unrecognised speech in a row
    max_ai_turns: int = 15  # AI gives up after this many caller turns without resolving
    max_tool_failures: int = 2
    hold_timeout_s: int = 120  # how long a caller waits for a human before voicemail

    # Telephony
    # Who places outbound AI calls from the app's Call tab: "elevenlabs", "valuefirst" or "twilio"
    call_provider: str = "elevenlabs"
    # ValueFirst (Infinito) voice: the API token, and the voice campaign set up in their portal
    valuefirst_api_token: str = ""
    valuefirst_campaign_id: str = ""
    valuefirst_api_url: str = "https://api.goinfinito.com/unified/v2/send"
    # ElevenLabs Agents: the phone agent. ElevenLabs does the speech, the AI and the phone call (through a number
    # imported into it from Twilio or a SIP trunk); this server places outbound calls and mirrors every
    # conversation into the app.
    eleven_labs_api_key: str = ""  # the secret key, which starts with sk_ (not the key's ID)
    eleven_labs_agent_id: str = ""  # agent_...
    eleven_labs_caller_id: str = ""  # the agent's phone number: its phnum_... id, or the number itself
    eleven_labs_webhooks_secret: str = ""  # signs the post-call webhook ElevenLabs sends to /elevenlabs/webhook
    eleven_labs_api_url: str = "https://api.elevenlabs.io"  # https://api.in.residency.elevenlabs.io for India residency
    eleven_labs_poll_s: float = 3.0  # how often live conversations are copied into the app
    schedule_poll_s: float = 5.0  # how often scheduled AI calls are checked and the due ones placed
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    validate_twilio_signature: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
