// Mirrors backend/app/features/*/models.py (camelCase on the wire)

export type CallStatus = 'ai_active' | 'awaiting_human' | 'human_active' | 'voicemail' | 'ended';
export type CallDirection = 'inbound' | 'outbound';
export type Speaker = 'caller' | 'ai' | 'system';

export interface Turn {
  speaker: Speaker;
  text: string;
  at: string;
}

export interface Call {
  id: string;
  fromNumber: string; // the customer's number, whichever side dialled
  direction: CallDirection;
  purpose: string; // outbound: what the AI is calling about
  twilioCallSid: string | null;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  transcript: Turn[];
  handoffId: string | null;
  voicemailUrl: string | null;
  notes: string;
  tags: string[];
  disposition: Disposition | null;
}

export type Disposition = 'resolved' | 'follow_up' | 'callback' | 'interested' | 'not_interested' | 'wrong_number' | 'no_answer';

export interface Contact {
  number: string; // E.164
  name: string;
  company: string;
  notes: string;
  favorite: boolean;
  blocked: boolean; // do-not-call
  updatedAt: string;
}

export type ScheduleStatus = 'scheduled' | 'placing' | 'placed' | 'failed' | 'cancelled';

export interface ScheduledCall {
  id: string;
  to: string;
  purpose: string;
  runAt: string;
  status: ScheduleStatus;
  callId: string | null;
  error: string;
  batchId: string | null;
  batchName: string;
  createdAt: string;
}

export type HandoffReason =
  | 'caller_requested_human'
  | 'agent_decided'
  | 'repeated_failure'
  | 'too_many_turns'
  | 'tool_failure'
  | 'model_refusal'
  | 'agent_error';

export type HandoffStatus = 'pending' | 'accepted' | 'expired';

export interface Handoff {
  id: string;
  callId: string;
  reason: HandoffReason;
  detail: string;
  summary: string;
  urgency: 'low' | 'normal' | 'high';
  status: HandoffStatus;
  assignedTo: string | null;
  createdAt: string;
  acceptedAt: string | null;
}

export type HumanStatus = 'online' | 'busy' | 'offline';

export interface Human {
  id: string;
  name: string;
  phone: string;
  status: HumanStatus;
  pushToken: string | null;
  uid: string | null; // Firebase user this profile belongs to
  email: string | null;
  role: string; // role id: super_admin, admin, user or a custom role
  grants: Record<string, Grant>; // permissions allowed / denied on top of the role
  accountState: 'active' | 'suspended';
}

// Role-based access (backend/app/features/auth/rbac.py)
export type PermissionId =
  | 'calls.view' | 'calls.notes' | 'calls.hangup' | 'calls.export'
  | 'dialer.call'
  | 'handoffs.view' | 'handoffs.take'
  | 'contacts.view' | 'contacts.edit' | 'contacts.block' | 'contacts.delete'
  | 'scheduling.view' | 'scheduling.create' | 'scheduling.campaigns' | 'scheduling.cancel'
  | 'insights.view'
  | 'ai_agent.view' | 'ai_agent.edit'
  | 'simulator.use'
  | 'team.view' | 'team.invite' | 'team.manage'
  | 'roles.manage' | 'admins.manage' | 'audit.view';

export interface Grant {
  allow: boolean;
  expiresAt: string | null; // temporary access
  by: string;
}

export interface Caller {
  role: string;
  roleLabel: string;
  rank: number;
  humanId: string | null;
  name: string;
  suspended: boolean;
  permissions: PermissionId[];
}

export interface Permission {
  id: PermissionId;
  module: string;
  label: string;
  description: string;
  superOnly: boolean;
}

export interface ModuleGroup {
  id: string;
  label: string;
  icon: string;
}

export interface RoleDef {
  id: string;
  label: string;
  description: string;
  rank: number;
  builtin: boolean;
  locked: boolean;
  permissions: PermissionId[];
}

export interface Catalog {
  modules: ModuleGroup[];
  permissions: Permission[];
  roles: RoleDef[];
}

export interface Member {
  human: Human;
  roleLabel: string;
  rank: number;
  permissions: PermissionId[];
  manageable: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export interface SuperAdminEntry {
  email: string;
  owner: boolean; // from the server settings: can't be removed from the app
  addedBy: string;
  addedAt: string | null;
  humanId: string | null; // their team profile, once they've signed in
  name: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetName: string;
  detail: string;
}

export interface AgentReply {
  text: string;
  handoffReason: HandoffReason | null;
  handoffDetail: string;
  urgency: string;
  endCall: boolean;
}

export type ServerEvent =
  | { type: 'snapshot'; calls: Call[]; handoffs: Handoff[] }
  | { type: 'call.started' | 'call.updated'; call: Call }
  | { type: 'call.transcript'; callId: string; turn: Turn }
  | { type: 'handoff.requested' | 'handoff.updated' | 'handoff.accepted'; handoff: Handoff }
  | { type: 'contact.updated'; contact: Contact }
  | { type: 'contact.deleted'; number: string }
  | { type: 'scheduled.updated'; scheduled: ScheduledCall }
  | { type: 'rbac.changed'; role?: string; humanId?: string };
