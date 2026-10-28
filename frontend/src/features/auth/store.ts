// The signed-in Firebase user, kept in sync with Firebase Auth. Not persisted: Firebase restores the session itself.
import { create } from 'zustand';

import { auth, watchAuth, type User } from '@/services/auth/firebase';

interface AuthUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  provider: 'google' | 'password' | 'other';
}

interface AuthState {
  user: AuthUser | null;
  initializing: boolean;
}

export const useAuth = create<AuthState>()(() => ({ user: null, initializing: true }));

const PROVIDERS: Record<string, AuthUser['provider']> = { 'google.com': 'google', password: 'password' };

const toAuthUser = (u: User): AuthUser => ({
  uid: u.uid,
  email: u.email,
  name: u.displayName,
  photoUrl: u.photoURL,
  provider: PROVIDERS[u.providerData[0]?.providerId ?? ''] ?? 'other',
});

/** Call once at startup. Returns the unsubscribe function. */
export function startAuthListener(onChange: (user: AuthUser | null) => void) {
  return watchAuth((u) => {
    const user = u ? toAuthUser(u) : null;
    useAuth.setState({ user, initializing: false });
    onChange(user);
  });
}

/** Re-read the current user, e.g. after the display name is set (Firebase doesn't fire an auth event for that). */
export function refreshAuthUser() {
  const u = auth.currentUser;
  useAuth.setState({ user: u ? toAuthUser(u) : null });
}
