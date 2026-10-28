// The signed-in agent's profile and which backend this app talks to. Persisted on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { env } from '@/config/env';
import type { Human } from '@/types';

interface ProfileState {
  serverUrl: string;
  builtWithUrl: string; // the default this build shipped with, to notice when a newer build changes it
  human: Human | null;
  setServerUrl: (url: string) => void;
  setHuman: (human: Human | null) => void;
}

// Quick tunnels (trycloudflare.com) get a new address every time they restart, so an old one is dead for good
const isQuickTunnel = (url: string) => /\.trycloudflare\.com$/i.test(url.replace(/\/+$/, ''));

/** After an update that ships a new default server: keep a server the person chose on purpose, but drop the
 *  old default or an old quick-tunnel address, which would otherwise leave the app stuck on a dead server. */
export function serverAfterUpdate(saved: { serverUrl?: string; builtWithUrl?: string }, newDefault: string): string {
  const url = saved.serverUrl;
  if (!url || saved.builtWithUrl === newDefault) return url || newDefault;
  return url === saved.builtWithUrl || isQuickTunnel(url) ? newDefault : url;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      serverUrl: env.DEFAULT_SERVER_URL,
      builtWithUrl: env.DEFAULT_SERVER_URL,
      human: null,
      setServerUrl: (url) => set({ serverUrl: url.trim().replace(/\/+$/, '') }),
      setHuman: (human) => set({ human }),
    }),
    {
      name: 'agentic-profile',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ProfileState>;
        return { ...current, ...saved, serverUrl: serverAfterUpdate(saved, env.DEFAULT_SERVER_URL), builtWithUrl: env.DEFAULT_SERVER_URL };
      },
    },
  ),
);
