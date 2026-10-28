// Firebase Auth: Google (native account picker) and email/password. The session persists on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';

import { env } from '@/config/env';

export type { User };

// Metro loads Firebase's react-native build, which adds this; the package's TypeScript types don't declare it
const { getReactNativePersistence } = firebaseAuth as typeof firebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

function createAuth(): Auth {
  if (getApps().length) return getAuth(getApp()); // fast refresh in development
  const app = initializeApp({
    ...env.firebase,
    authDomain: `${env.firebase.projectId}.firebaseapp.com`,
  });
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

export const auth = createAuth();

if (env.GOOGLE_WEB_CLIENT_ID) {
  GoogleSignin.configure({ webClientId: env.GOOGLE_WEB_CLIENT_ID });
}

export const watchAuth = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

/** An ID token for the backend. Firebase caches it and refreshes it shortly before it expires. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
}

/** Resolves to false if the user closed the Google account picker. */
export async function signInWithGoogle(): Promise<boolean> {
  if (!env.GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google sign-in is not set up in this build (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing).');
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return false;
    if (!res.data.idToken) throw new Error('Google did not return an ID token.');
    await signInWithCredential(auth, GoogleAuthProvider.credential(res.data.idToken));
    return true;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return false;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services is not available on this device.');
      // DEVELOPER_ERROR: the app's SHA-1 / package is not registered for this web client ID
      if (e.code === '10' || e.code === 'DEVELOPER_ERROR') {
        throw new Error("Google sign-in isn't set up for this app yet: add the app's SHA-1 fingerprint in Firebase.");
      }
    }
    throw authError(e);
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw authError(e);
  }
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(user, { displayName: name.trim() });
  } catch (e) {
    throw authError(e);
  }
}

export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    throw authError(e);
  }
}

export async function signOut() {
  if (env.GOOGLE_WEB_CLIENT_ID) {
    await GoogleSignin.signOut().catch(() => {}); // so the account picker shows next time
  }
  await firebaseSignOut(auth);
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/account-exists-with-different-credential': 'This email is registered with another sign-in method.',
};

export const EMAIL_IN_USE = 'auth/email-already-in-use';

/** An Error with a friendly message that keeps Firebase's `code`, so screens can react to specific failures. */
export type AuthError = Error & { code?: string };

function authError(e: unknown): AuthError {
  const code = (e as { code?: string })?.code;
  return Object.assign(new Error((code && MESSAGES[code]) || (e as Error)?.message || 'Sign-in failed.'), { code });
}
