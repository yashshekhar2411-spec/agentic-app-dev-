"""A fake phone call driven by text: same AI + handoff logic as a real Twilio call."""

from fastapi import APIRouter, HTTPException

from app.features.agent.orchestrator import add_turn, handle_caller_turn
from app.features.agent.prompts import greeting
from app.services.realtime.bus import bus
from app.storage.store import store
from app.features.handoff import service as handoff_service
from app.features.calls.models import Call, CallStatus, SimulateSayRequest, SimulateStartRequest, Speaker

router = APIRouter(prefix="/simulate/calls", tags=["simulator"])


async def _get_call(call_id: str) -> Call:
    call = await store.get_call(call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    return call


@router.post("")
async def simulate_start(body: SimulateStartRequest) -> dict:
    call = await store.add_call(Call(from_number=body.from_number))
    await bus.publish("call.started", {"call": call.to_wire()})
    text = greeting()
    await add_turn(call, Speaker.AI, text)
    return {"call": call.to_wire(), "reply": text}


@router.post("/{call_id}/say")
async def simulate_say(call_id: str, body: SimulateSayRequest) -> dict:
    call = await _get_call(call_id)
    if call.status != CallStatus.AI_ACTIVE:
        raise HTTPException(409, f"Call is {call.status.value}; the AI is no longer handling it")
    reply = await handle_caller_turn(call, body.text)
    if reply.handoff_reason:
        await handoff_service.start_handoff(call, reply)
    elif reply.end_call:
        await handoff_service.end_call(call)
    return {"reply": reply.to_wire(), "call": call.to_wire()}


@router.post("/{call_id}/hangup")
async def simulate_hangup(call_id: str) -> dict:
    call = await _get_call(call_id)
    await handoff_service.end_call(call)
    return {"call": call.to_wire()}
