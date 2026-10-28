# Agentic Call Center

An AI voice agent answers every phone call first. When it can't handle the call, it hands it to a human agent, who takes over from the mobile app.

```
Caller ──► Twilio ──► backend (Python/FastAPI)
                         │  AI turn: Claude + tools (orders, bookings)
                         │  features/handoff/policy checks every turn
                         ▼
                 can the AI finish? ── yes ──► answers / ends the call
                         │ no
                         ▼
     caller is put on hold (Twilio queue) + AI writes a summary
     + agent app gets a live alert (WebSocket)
                         ▼
     human taps "Take call" ─► Twilio rings the human's phone, reads the
     summary, then connects them to the caller
     (nobody answers within HOLD_TIMEOUT_S ─► voicemail)
```

## When the AI hands off

- **The caller asks for a person.** Checked by `features/handoff/policy.py`, which uses regex and also understands Hindi phrases.
- **Claude decides it can't help.** It calls the `request_handoff` tool for refunds, complaints, anything it would have to guess, or an upset caller.
- **The call isn't going well.** Three silent or unclear turns in a row, too many turns without a fix, or repeated tool failures.
- **The AI breaks.** A Claude error, a timeout (more than 12 seconds, since Twilio gives up at 15), or a refusal.

## Layout

```
agentic app/
├── backend/                         Python · FastAPI
│   ├── app/
│   │   ├── main.py                  app factory: CORS + all routers
│   │   ├── config/settings.py       settings from backend/.env
│   │   ├── features/                one folder per feature: router.py (HTTP), models.py (camelCase JSON), logic
│   │   │   ├── agent/               the AI: orchestrator (policy → AI → policy), brains/ (claude, demo),
│   │   │   │                        claude_client, prompts, tools, summarizer, router (/agent-config: voice, greeting…)
│   │   │   ├── auth/                Firebase ID token / API token checks, rbac.py (roles, modules, access checks)
│   │   │   ├── calls/               /calls (incl. outbound, PATCH notes/tags/outcome), outbound.py (places AI calls), simulator
│   │   │   ├── contacts/            /contacts: names, favourites, do-not-call list (backend/contacts.json)
│   │   │   ├── team/                /rbac: my access, role permissions, team members' roles and modules
│   │   │   ├── schedule/            /scheduled: callbacks + bulk campaigns, runner places due calls (backend/scheduled_calls.json)
│   │   │   ├── handoff/             /handoffs, policy (when to hand off), service (lifecycle)
│   │   │   ├── health/              /health
│   │   │   └── profile/             /humans: agent profiles linked to Firebase accounts
│   │   ├── services/                connections to the outside world
│   │   │   ├── realtime/            WebSocket event bus + /ws
│   │   │   ├── telephony/
│   │   │   │   ├── twilio/          calls.py (ring a human or customer) · webhooks.py (/twilio/*)
│   │   │   │   ├── valuefirst/      calls.py (trigger a campaign) · webhooks.py (/valuefirst/dlr)
│   │   │   │   ├── elevenlabs/      client.py · sync.py (copies live conversations) · webhooks.py (post-call transcripts)
│   │   │   │   └── urls.py          public callback URLs
│   │   │   └── notifications.py     push alerts
│   │   ├── storage/                 store (memory / PostgreSQL), conversations (per-call AI state: Redis or memory), lifecycle (connect/close)
│   │   └── utils/api_model.py       shared model base, ids, timestamps
│   ├── tests/                       mirrors app/ (features/, services/telephony/{twilio,valuefirst}/, storage/)
│   ├── pyproject.toml               dependencies, pytest settings
│   └── .env.example
│
├── frontend/                        React Native · Expo Router
│   └── src/
│       ├── app/                     screens (the folder layout is the URL layout)
│       │   ├── (tabs)/              Live · Call · Queue · History · Settings
│       │   ├── preferences/         settings pages: profile, agent, notifications, calling, country, server, status
│       │   ├── call/[id], handoff/[id], simulate, sign-in
│       │   ├── contacts, contact       address book, do-not-call, per-contact call history
│       │   ├── scheduled, schedule     scheduled callbacks and calling campaigns
│       │   ├── insights                call analytics (volume, connect rate, AI resolution, outcomes, tags)
│       │   └── _layout.tsx          navigation + sign-in guard
│       ├── features/                one folder per feature: api, store, components/, hooks/
│       │   ├── auth/                signed-in Firebase user
│       │   ├── calls/               CallCard, LiveTranscript, StatusPill, CallControls
│       │   ├── handoff/             HandoffCard, ContextSummary, queue selectors
│       │   ├── profile/             agent profile + server URL; ProfileHeader, StatsRow, AvailabilityPicker
│       │   └── settings/            on-device preferences, AI agent settings API, settings list rows
│       ├── components/
│       │   ├── ui/                  shared building blocks: Button, Card, Avatar, Pill, Stepper, EmptyState, Elapsed
│       │   ├── brand/               Logo, Splash
│       │   └── navigation/          Sidebar drawer, header buttons, calls grouped by day
│       ├── services/                api client, Firebase auth, realtime socket, notifications
│       ├── state/liveStore.ts       live calls + handoffs, fed by the WebSocket
│       └── config/, hooks/, theme/, utils/, types.ts
│
└── docs/handoff-flow.md             step-by-step handoff walkthrough
```

## Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"   # dependencies are in pyproject.toml
copy .env.example .env      # then fill it in
.venv\Scripts\python -m pytest
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Storage (PostgreSQL + Redis)

Set both in `backend/.env`:

- `DATABASE_URL`: PostgreSQL, e.g. `postgresql://postgres:PASSWORD@localhost:5432/agentic`. Holds calls, transcripts, handoffs and agent profiles. The database and tables are created on first start. If the password contains `@ : / # ?`, URL-encode it (`@` → `%40`). Cloud databases (Supabase, Neon) usually need `?sslmode=require` at the end.
- `REDIS_URL`: Redis, e.g. an Upstash / Redis Cloud `rediss://…` URL. Holds each live call's AI state, a lock so a call's turns run one at a time on any server, and the event channel that reaches agents connected to every server.

Leave either empty and that part stays in memory (fine for trying things out; lost on restart). `GET /health` reports which is in use (`storage`, `liveState`).

Tests use memory storage regardless of `.env`. To run them against real servers, point them at **throwaway** ones (every test wipes the data): `TEST_DATABASE_URL=postgresql://…/agentic_test TEST_REDIS_URL=redis://… python -m pytest`.

If `ANTHROPIC_API_KEY` is empty, the backend runs a keyword-based **demo agent** instead of Claude, so you can try the flow without a key. Set the key to use the real AI.

### Real phone calls (Twilio)

1. Expose the backend with `ngrok http 8000`, then set `PUBLIC_BASE_URL` to the ngrok URL.
2. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER`.
3. In the Twilio console, on your number:
   - **A call comes in:** `POST {PUBLIC_BASE_URL}/twilio/voice`
   - **Call status changes:** `POST {PUBLIC_BASE_URL}/twilio/status`

### AI calls a customer (outbound)

Outbound calls go through **ValueFirst** by default (`CALL_PROVIDER=valuefirst`, `VALUEFIRST_API_TOKEN`, `VALUEFIRST_CAMPAIGN_ID` in `backend/.env`). Each call triggers that ValueFirst voice campaign for the number. The customer hears whatever the campaign is set up to play or connect to in the ValueFirst portal. ValueFirst's delivery report (`POST {PUBLIC_BASE_URL}/valuefirst/dlr?call_id=…`) then closes the call in the app. Set `CALL_PROVIDER=twilio` to use the Twilio flow below instead.

In the app, open the **Call** tab, type a number (and optionally what the call is about), and tap **Call with AI**. Twilio rings that number from `TWILIO_PHONE_NUMBER`. When the person picks up, the AI introduces itself and the conversation runs through the same AI turns and handoff rules as an inbound call. The live transcript opens in the app, with a **Hang up** button.

- `POST /calls/outbound` `{ "to": "+919876543210", "purpose": "their order delivery" }` places the call. Twilio then calls back `/twilio/outbound` (pickup) and `/twilio/status?call_id=…` (busy, no answer, ended). Nothing needs setting up in the Twilio console.
- This needs the same Twilio setup as above, and `PUBLIC_BASE_URL` has to be public (ngrok). Otherwise Twilio can't fetch what the AI should say.
- A Twilio **trial** account can only call numbers verified under *Phone Numbers → Verified Caller IDs*, and it plays a trial message before the AI speaks.

## Run the app

Run the backend first; signing in to the app needs it to load your agent profile.

The emulator reaches your PC at `http://10.0.2.2:8000`. On a real phone, open **Settings** in the app and enter your PC's LAN IP, e.g. `http://192.168.1.20:8000`.

```bash
cd frontend
npm install
npx expo start             # dev server
```

To build the APK (use a short path on Windows, or Gradle hits the 260-character limit):

```bash
npx expo prebuild --platform android
cd android && gradlew assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a
```

## Sign-in (Firebase Auth)

Agents sign in with **Google** or **email/password** through Firebase project `agentic-app-f376c`. The app sends the Firebase ID token with every request; the backend checks it against `FIREBASE_PROJECT_ID` and links each account to one agent profile (name + phone to ring).

- `frontend/.env`: `EXPO_PUBLIC_FIREBASE_*` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Firebase console → Authentication → Sign-in method → Google → Web SDK configuration).
- `backend/.env`: `FIREBASE_PROJECT_ID`. `API_TOKEN` is an optional extra secret for scripts. With neither set, the API is open (dev only).
- Google sign-in on Android also needs an Android app in Firebase with package `com.agentic.callcenter` and the SHA-1 of the signing key. Get it with `keytool -list -v -keystore android/app/debug.keystore -storepass android` (and add your release key's SHA-1 too).
- Apple sign-in is iOS-only and isn't wired up in this Android app.

## Roles and access (RBAC)

Modelled on how Instagram / Meta Business share account access. The server checks a fine-grained permission on
every request (`backend/app/features/auth/rbac.py`); the app hides what a person can't use.

| Role (rank) | What it is |
|---|---|
| Super admin (100) | The owner. Every permission, always, including the exclusive ones: edit roles, manage admins, audit log |
| Admin (50) | Runs the team: all non-exclusive permissions by default; invites, suspends, replaces and manages users and custom roles |
| Custom roles (30) | Made by a super admin from any non-exclusive permissions (e.g. Supervisor, Viewer) |
| User (10) | Day-to-day agent: calls, notes, placing calls, the queue, viewing contacts, single callbacks |

- **25 permissions** in 10 modules, e.g. `calls.notes` vs `calls.hangup`, `contacts.block` vs `contacts.delete`, `scheduling.create` vs `scheduling.campaigns`.
- **Per person**: allow or deny single permissions on top of their role, permanently or for 1 hour / 1 day / 7 days.
- **Rules**: you can only act on people ranked below you (admins and super admins: super admins only), only give roles below your own, and only give permissions you have yourself. Nobody changes their own access; there is always an active super admin.
- **Accounts**: suspend / reactivate; *replace* hands someone's role and access to another person and suspends them.
- **Invites**: by email with a role, applied when they sign up (7 days).
- **Audit log**: every change, who did it and when (`backend/rbac_audit.json`).
- The first person to sign up becomes the super admin; `SUPER_ADMIN_EMAILS` in `backend/.env` adds more. The shared `API_TOKEN` (and open dev mode) acts as a super admin. Roles are saved in `backend/roles.json`, invites in `backend/invites.json`.

## Try it without a phone line

In the app, tap **Live → Start a test call** and type as the caller:
- "Where is my order ORD-1001?" — the AI answers it alone.
- "I want a refund" — the AI hands off, and the call appears in **Queue** with a summary.
- In the Queue, tap **Take call**.

## Run in production

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips="*" --no-access-log
```

- **More than one worker (or server) needs both `DATABASE_URL` and `REDIS_URL`.** Without Redis, use `--workers 1`.
- Each worker opens up to `DB_POOL_MAX` (default 10) Postgres connections: keep workers × servers × 10 under your database's connection limit.
- In `backend/.env`: `ENABLE_SIMULATOR=false`, `CORS_ORIGINS` set to your real origins, `FIREBASE_PROJECT_ID` set, `VALIDATE_TWILIO_SIGNATURE=true`, `PUBLIC_BASE_URL` set to the public HTTPS URL.
- Put it behind a proxy that terminates TLS and allows WebSocket upgrades on `/ws`. Point health checks at `/health`.

## Not production-ready yet

- **Push notifications:** these need Firebase (FCM) for the Android build. Until then, alerts only work while the app is open (vibration plus the in-app banner).
