import { api } from '@/services/api/client';
import type { Contact } from '@/types';

export const fetchContacts = () => api<Contact[]>('/contacts');

// Create or change: only the fields given change
export const saveContact = (number: string, patch: Partial<Pick<Contact, 'name' | 'company' | 'notes' | 'favorite' | 'blocked'>>) =>
  api<Contact>(`/contacts/${encodeURIComponent(number)}`, { method: 'PUT', body: patch });

export const deleteContact = (number: string) => api<{ deleted: string }>(`/contacts/${encodeURIComponent(number)}`, { method: 'DELETE' });
