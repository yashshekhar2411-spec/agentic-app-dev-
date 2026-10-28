import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config.settings import get_settings
from app.features.agent import claude_client
from app.features.agent import router as agent_config
from app.features.auth import rbac
from app.features.auth.security import require_principal
from app.features.calls import router as calls, simulator
from app.features.contacts import router as contacts
from app.features.contacts import store as contact_store
from app.features.handoff import router as handoffs, service as handoff_service
from app.features.health import router as health
from app.features.profile import router as profile
from app.features.schedule import router as scheduled, runner as schedule_runner
from app.features.schedule import store as schedule_store
from app.features.team import records as team_records, router as team
from app.services import notifications
from app.services.realtime import router as realtime
from app.services.telephony.elevenlabs import client as elevenlabs, sync as elevenlabs_sync, webhooks as elevenlabs_webhooks
from app.services.telephony.twilio import webhooks as twilio
from app.services.telephony.valuefirst import calls as valuefirst, webhooks as valuefirst_webhooks
from app.storage.lifecycle import close_state, open_state

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if not s.api_token and not s.firebase_project_id:
        log.warning("Neither FIREBASE_PROJECT_ID nor API_TOKEN is set: the agent API is open to anyone")
    if not s.anthropic_api_key:
        log.warning("ANTHROPIC_API_KEY is not set: calls are answered by the keyword DEMO agent")
    if s.enable_simulator:
        log.warning("ENABLE_SIMULATOR is on: turn it off in production")
    agent_config.load_saved()
    rbac.roles.load(rbac.SAVED_FILE)
    rbac.super_admin_emails.load(rbac.SUPER_ADMINS_FILE)
    team_records.audit.load(team_records.AUDIT_FILE)
    team_records.invites.load(team_records.INVITES_FILE)
    contact_store.contacts.load(contact_store.SAVED_FILE)
    schedule_store.schedule.load(schedule_store.SAVED_FILE)
    await open_state(s)
    poller = asyncio.create_task(elevenlabs_sync.poll_forever())  # copies live ElevenLabs conversations into the app
    scheduler = asyncio.create_task(schedule_runner.run_forever())  # places scheduled calls and campaigns
    yield
    poller.cancel()
    scheduler.cancel()
    # Graceful shutdown: let in-flight handoff briefs finish, then close pooled connections
    await handoff_service.drain_background(timeout=10)
    await notifications.close()
    await claude_client.close_client()
    await valuefirst.close()
    await elevenlabs.close()
    await close_state()


def build_router() -> APIRouter:
    """REST + WebSocket API for the agent app, plus the Twilio webhooks."""
    s = get_settings()
    router = APIRouter()
    router.include_router(health.router)  # open: used by load balancers
    router.include_router(realtime.router)  # checks the token itself (query string)
    router.include_router(twilio.router)  # checked by Twilio signature instead
    router.include_router(valuefirst_webhooks.router)  # delivery reports; they only close calls
    router.include_router(elevenlabs_webhooks.router)  # post-call transcripts; checked by the ElevenLabs signature
    # Each endpoint also checks the caller's role/module access (app/features/auth/rbac.py)
    protected = [calls.router, handoffs.router, profile.router, agent_config.router, contacts.router, scheduled.router, team.router]
    for r in protected:
        router.include_router(r, dependencies=[Depends(require_principal)])
    if s.enable_simulator:
        router.include_router(simulator.router, dependencies=[Depends(require_principal), Depends(rbac.require("simulator.use"))])
    return router

 
def create_app() -> FastAPI:
    s = get_settings()
    logging.basicConfig(level=s.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = FastAPI(title="Agentic Call Center", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, 
        allow_origins=s.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    # Call lists with transcripts get large; compress them for agents on mobile data
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.include_router(build_router())
    return app


app = create_app()
