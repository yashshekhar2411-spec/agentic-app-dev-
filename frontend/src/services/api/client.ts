import { useProfile } from '@/features/profile/store';
import { getIdToken } from '@/services/auth/firebase';

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(base: string, path: string, init: { method?: string; body?: unknown }, token: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, controller.signal.aborted ? `The server at ${base} took too long to answer` : `Can't reach the server at ${base}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = useProfile.getState().serverUrl;
  let res = await request(base, path, init, await getIdToken());
  if (res.status === 401) {
    // The ID token may have just expired: retry once with a freshly minted one
    res = await request(base, path, init, await getIdToken(true));
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const json = await res.json();
      if (typeof json?.detail === 'string') detail = json.detail;
      else if (Array.isArray(json?.detail) && json.detail[0]?.msg) detail = String(json.detail[0].msg);
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
