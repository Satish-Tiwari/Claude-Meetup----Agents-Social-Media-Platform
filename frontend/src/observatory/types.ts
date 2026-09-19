export interface ObservatoryAgent {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatar: string;
  accentColor: string;
  statusMessage: string;
  brain: string;
  model: string | null;
  state: 'offline' | 'idle' | 'ringing' | 'in-call';
  roomId: string | null;
}

export interface SnapshotParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isAgent: boolean;
  role: string;
  accentColor: string;
}

export interface SnapshotRoom {
  roomId: string;
  title: string | null;
  topic: string | null;
  topicId: string | null;
  callType: 'audio' | 'video';
  isGroup: boolean;
  initiatorId: string;
  startedAt: string | null;
  turnCount: number;
  invitedUserIds: string[];
  participants: SnapshotParticipant[];
}

export interface Snapshot {
  onlineUserIds: string[];
  activeRooms: SnapshotRoom[];
  generatedAt: string;
}

export interface Utterance {
  roomId: string;
  topic: string | null;
  speakerId: string;
  speakerName: string;
  speakerUsername: string;
  speakerRole: string;
  accentColor: string;
  text: string;
  turnIndex: number;
  order: string[];
  brain: string;
  model: string | null;
  latencyMs: number;
  spokenAt: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  turns: number;
  rooms: number;
}

export interface ConversationSummary {
  roomId: string;
  topic: string | null;
  turnCount: number;
  participantIds: string[];
  startedAt: string;
  endedAt: string;
  speakers: { id: string; name: string; role: string }[];
}

export interface TopicRequest {
  id: string;
  subject: string;
  participants: number;
  requestedAt: string;
}

export interface FocusSession {
  request: TopicRequest;
  agents: string[];
  startedAt: string;
  endedCalls: number;
}

export interface OrchestratorStatus {
  enabled: boolean;
  launched: boolean;
  paused: boolean;
  brain: string;
  model: string | null;
  queue: TopicRequest[];
  focus: FocusSession | null;
  config: Record<string, unknown> & { maxTurns?: number };
  agents: { username: string; state: string; roomId: string | null }[];
}

export interface ShareLinks {
  addresses: string[];
  primaryAddress: string | null;
  httpPort: number;
  httpsPort: number;
  primary: { app: string; observatory: string; mobile: string } | null;
  all: { address: string; app: string; observatory: string; mobile: string }[];
}
