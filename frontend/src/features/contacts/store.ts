// The team's shared contacts (names, favourites, do-not-call), loaded from the server and kept live by the socket.
import { Alert } from 'react-native';
import { create } from 'zustand';

import { deleteContact, fetchContacts, saveContact } from '@/features/contacts/api';
import type { Contact } from '@/types';
import { formatPhone } from '@/utils/phone';

interface ContactsState {
  byNumber: Record<string, Contact>;
  loaded: boolean;
  refresh: () => Promise<void>;
  upsert: (contact: Contact) => void;
  remove: (number: string) => void;
}

export const useContacts = create<ContactsState>()((set) => ({
  byNumber: {},
  loaded: false,
  refresh: async () => {
    try {
      const list = await fetchContacts();
      set({ byNumber: Object.fromEntries(list.map((c) => [c.number, c])), loaded: true });
    } catch {
      // offline or an older server without contacts: keep what we have
    }
  },
  upsert: (contact) => set((s) => ({ byNumber: { ...s.byNumber, [contact.number]: contact } })),
  remove: (number) =>
    set((s) => {
      const { [number]: _gone, ...rest } = s.byNumber;
      return { byNumber: rest };
    }),
}));

/** The contact's name for a number, or null if it has none. */
export const useContactName = (number: string | undefined) => useContacts((s) => (number ? s.byNumber[number]?.name || null : null));

/** "Asha Rao" if the number is saved with a name, otherwise the formatted number. */
export const useDisplayName = (number: string) => useContactName(number) ?? formatPhone(number);

export const isBlocked = (number: string) => !!useContacts.getState().byNumber[number]?.blocked;

/** Save a change and put the server's copy in the store; shows an alert if it fails. */
export async function updateContact(number: string, patch: Parameters<typeof saveContact>[1]): Promise<Contact | null> {
  try {
    const saved = await saveContact(number, patch);
    useContacts.getState().upsert(saved);
    return saved;
  } catch (e) {
    Alert.alert("Couldn't save the contact", (e as Error).message);
    return null;
  }
}

export async function removeContact(number: string): Promise<boolean> {
  try {
    await deleteContact(number);
    useContacts.getState().remove(number);
    return true;
  } catch (e) {
    Alert.alert("Couldn't delete the contact", (e as Error).message);
    return false;
  }
}
