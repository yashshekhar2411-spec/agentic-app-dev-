# Handoff flow

1. Caller -> Twilio -> `POST /twilio/voice`. The AI greets the caller and listens (`<Gather input="speech">`).
2. On each caller turn (`/twilio/gather`), `features/agent/orchestrator.handle_caller_turn()` does three things:
   - runs `features/handoff/policy.check_before_agent()`: the caller asked for a person, or the silence limit was hit;
   - runs Claude with tools; Claude may call `request_handoff` or `end_call`;
   - runs `features/handoff/policy.check_after_agent()`: repeated tool failures.
3. On handoff, `features/handoff/service.start_handoff()` does three things:
   - puts the caller in a Twilio queue (`<Enqueue>`) with hold music;
   - sends `handoff.requested` to the app over WebSocket right away;
   - writes the AI summary in the background, then sends `handoff.updated` and a push notification.
4. A human taps **Take call** (`POST /handoffs/{id}/accept`). The first person to accept gets the call.
   - `services/telephony/twilio/calls.connect_human()` rings the human's phone.
   - Twilio reads them the summary, then `<Dial><Queue>` connects them to the caller.
5. If nobody accepts within `HOLD_TIMEOUT_S`, the caller leaves the queue and records a voicemail (`/twilio/voicemail`).
6. The caller hangs up (`/twilio/status`) -> the call ends, a pending handoff expires, and the human is set back to online.

Background push notifications need Firebase (FCM) configured in the Android build. Until then, the app alerts with vibration and an in-app banner while it's open.
