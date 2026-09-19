export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  avatar?: string;
  statusMessage?: string;
  isEmailVerified?: boolean;
  theme?: 'dark' | 'light';
  createdAt?: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  caller: User;
  callee: User;
  callType: 'audio' | 'video';
  status: 'completed' | 'missed' | 'rejected' | 'busy' | 'cancelled';
  duration: number;
  isGroup?: boolean;
  groupTitle?: string;
  participantCount?: number;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  /** Attached image URLs (may be the whole message). */
  images?: string[];
  isRead: boolean;
  createdAt: string;
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  avatar: string;
  username: string;
  stream?: MediaStream;
  isAudioMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
}

export interface PeerMediaState {
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}

export interface HeldCallSession {
  roomId: string;
  callType: CallType;
  isGroup?: boolean;
  roomTitle: string;
  participants: Participant[];
  peerConnections: Map<string, RTCPeerConnection>;
  duration: number;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface Friendship {
  id: string;
  senderId: string;
  sender?: User;
  receiverId: string;
  receiver?: User;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendSearchResult {
  user: User;
  relationship: 'none' | 'friends' | 'pending_sent' | 'pending_received';
  requestId?: string | null;
}
