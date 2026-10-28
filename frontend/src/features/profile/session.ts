// Keeps the agent profile in step with who is signed in to Firebase.
import { fetchMyProfile, registerHuman } from '@/features/profile/api';
import { setMyStatus } from '@/features/profile/availability';
import { useProfile } from '@/features/profile/store';
import { useAccess } from '@/features/rbac/store';
import { ApiError } from '@/services/api/client';
import { signOut as firebaseSignOut } from '@/services/auth/firebase';

let inFlight: { uid: string | null; done: Promise<void> } | null = null;

/** Load the server's profile for this Firebase user (or restore it if the server lost it). Calls made while one
 *  is running share it: sign-in and the live connection both ask at launch, and must not sign up twice. */
export function syncProfile(uid: string | null): Promise<void> {
  if (inFlight && inFlight.uid === uid) return inFlight.done;
  const done = doSync(uid).finally(() => {
    if (inFlight?.done === done) inFlight = null;
  });
  inFlight = { uid, done };
  return done;
}

async function doSync(uid: string | null): Promise<void> {
  const { human, setHuman } = useProfile.getState();
  if (!uid) {
    setHuman(null);
    useAccess.getState().clear();
    return;
  }
  if (human && human.uid !== uid) setHuman(null); // a different account signed in on this phone
  try {
    setHuman(await fetchMyProfile());
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) return; // offline: keep the cached profile
    const cached = useProfile.getState().human;
    // The server keeps profiles in memory, so after a restart re-create ours from the cached copy
    setHuman(cached ? await registerHuman(cached.name, cached.phone).catch(() => null) : null);
  } finally {
    void useAccess.getState().refresh(); // the role comes with the profile
  }
}

export async function signOut(): Promise<void> {
  try {
    await setMyStatus('offline'); // stop handoff alerts going to this phone
  } catch {
    // no profile or server unreachable: sign out locally anyway
  }
  useProfile.getState().setHuman(null);
  useAccess.getState().clear();
  await firebaseSignOut();
}
