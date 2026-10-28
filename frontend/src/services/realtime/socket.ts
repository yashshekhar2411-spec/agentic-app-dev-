// WebSocket to the backend: receives every call / handoff event and feeds the live store.
import { AppState, NativeEventSubscription } from 'react-native';

import { useContacts } from '@/features/contacts/store';
import { useAuth } from '@/features/auth/store';
import { syncProfile } from '@/features/profile/session';
import { useAccess } from '@/features/rbac/store';
import { useSchedule } from '@/features/schedule/store';
import { useLive } from '@/state/liveStore';
import { alertNewHandoff } from '@/services/notifications';
import type { ServerEvent } from '@/types';

type TokenSource = () => Promise<string | null>;

let socket: WebSocket | null = null;
let serverUrl: string | null = null;
let getToken: TokenSource = async () => null;
let session = 0; // bumps on every start/stop so stale async opens give up
let retries = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let connectTimer: ReturnType<typeof setTimeout> | undefined;
let lastHeard = 0; // when the server last sent anything (events or its "pong")
let appStateSub: NativeEventSubscription | undefined;

const CONNECT_TIMEOUT_MS = 10_000; // a connect that never completes would otherwise hang forever
const PING_EVERY_MS = 25_000;
const SILENCE_LIMIT_MS = 60_000; // no pong for this long: the connection is dead even if it looks open

function scheduleReconnect(mySession: number) {
  if (mySession !== session) return;
  const delay = Math.min(1000 * 2 ** retries++, 15_000);
  reconnectTimer = setTimeout(() => void open(), delay);
}

/** Drop `ws` without waiting for the OS to notice, and try again. */
function abandon(ws: WebSocket, mySession: number) {
  if (socket !== ws) return;
  socket = null;
  clearTimeout(connectTimer);
  clearInterval(pingTimer);
  ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
  ws.close();
  useLive.getState().setConnected(false);
  scheduleReconnect(mySession);
}

async function open() {
  const mySession = session;
  clearTimeout(reconnectTimer);
  if (!serverUrl) return;
  let token: string | null = null;
  try {
    token = await getToken(); // fresh each time: ID tokens expire after an hour
  } catch {
    // offline: try without, the server will refuse and we retry later
  }
  if (mySession !== session || !serverUrl) return;

  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws = new WebSocket(serverUrl.replace(/^http/, 'ws') + '/ws' + query);
  socket = ws;

  connectTimer = setTimeout(() => ws.readyState !== WebSocket.OPEN && abandon(ws, mySession), CONNECT_TIMEOUT_MS);

  ws.onopen = () => {
    clearTimeout(connectTimer);
    retries = 0;
    lastHeard = Date.now();
    useLive.getState().setConnected(true);
    // Contacts and scheduled calls aren't in the snapshot: (re)load them on every connect. The server may also
    // have restarted and forgotten our profile (memory mode): restore it, which reloads our role too.
    void syncProfile(useAuth.getState().user?.uid ?? null);
    void useContacts.getState().refresh();
    void useSchedule.getState().refresh();
    pingTimer = setInterval(() => {
      if (Date.now() - lastHeard > SILENCE_LIMIT_MS) return abandon(ws, mySession);
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, PING_EVERY_MS);
  };
  ws.onmessage = (msg) => {
    lastHeard = Date.now();
    let event: ServerEvent;
    try {
      event = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (event.type === 'rbac.changed') {
      useAccess.setState((s) => ({ changes: s.changes + 1 }));
      return void useAccess.getState().refresh();
    }
    if (event.type === 'contact.updated') return useContacts.getState().upsert(event.contact);
    if (event.type === 'contact.deleted') return useContacts.getState().remove(event.number);
    if (event.type === 'scheduled.updated') return useSchedule.getState().upsert(event.scheduled);
    useLive.getState().applyEvent(event);
    if (event.type === 'handoff.requested') alertNewHandoff(event.handoff);
  };
  ws.onerror = () => ws.close();
  ws.onclose = () => {
    clearTimeout(connectTimer);
    clearInterval(pingTimer);
    if (socket !== ws) return; // replaced by a newer connection
    socket = null;
    useLive.getState().setConnected(false);
    scheduleReconnect(mySession);
  };
}

export function startRealtime(url: string, tokenSource: TokenSource) {
  stopRealtime();
  serverUrl = url;
  getToken = tokenSource;
  retries = 0;
  void open();
  // Phones drop sockets in the background; reconnect right away when the app comes back
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state !== 'active' || !serverUrl) return;
    if (socket && socket.readyState === WebSocket.OPEN) return;
    // Nothing open (or a connect stuck halfway): start over now instead of waiting for a backoff
    if (socket) abandon(socket, session);
    retries = 0;
    void open();
  });
}

export function stopRealtime() {
  session++;
  serverUrl = null;
  appStateSub?.remove();
  appStateSub = undefined;
  clearTimeout(reconnectTimer);
  clearTimeout(connectTimer);
  clearInterval(pingTimer);
  const ws = socket;
  socket = null;
  ws?.close();
  useLive.getState().setConnected(false);
}
