import { api } from '@/services/api/client';

export interface AgentConfig {
  companyName: string;
  callLanguage: string;
  ttsVoice: string;
  customGreeting: string;
  holdTimeoutS: number;
  maxAiTurns: number;
}

export interface AgentConfigView {
  config: AgentConfig;
  greetingPreview: string;
  outboundPreview: string;
  voices: { id: string; label: string }[];
  languages: { id: string; label: string }[];
}

export interface Health {
  ok: boolean;
  agent: 'claude' | 'demo';
  storage?: string;
  liveState?: string;
  realtimeClients?: number;
}

// How the AI sounds and behaves on calls: shared by everyone using this server
export const fetchAgentConfig = () => api<AgentConfigView>('/agent-config');

export const updateAgentConfig = (patch: Partial<AgentConfig>) =>
  api<AgentConfigView>('/agent-config', { method: 'PATCH', body: patch });

export const fetchHealth = () => api<Health>('/health');
