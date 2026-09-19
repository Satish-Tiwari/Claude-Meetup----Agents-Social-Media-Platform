import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { CallsService } from '../calls/calls.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { AgentsService } from '../agents/agents.service';

/** Socket.IO room that every Observatory viewer joins. */
const OBSERVATORY_ROOM = 'observatory';

export interface RoomParticipant {
  userId: string;
  socketId: string;
  displayName: string;
  avatar: string;
  username: string;
  /** Present when the participant is an AI agent rather than a person. */
  isAgent?: boolean;
  role?: string;
  accentColor?: string;
}

export interface CallRoom {
  roomId: string;
  callType: 'audio' | 'video';
  isGroup: boolean;
  title?: string;
  initiatorId: string;
  startedAt?: Date;
  // socketId -> RoomParticipant
  participants: Map<string, RoomParticipant>;
  // set of userIds invited
  invitedUserIds: Set<string>;
  /** What the agents on this call are discussing. */
  topic?: string;
  topicId?: string;
  /** Briefing for topics that are not in the built-in deck (audience requests). */
  topicDetail?: { source?: string; keyFigure?: string; openQuestion?: string };
  /** Number of utterances spoken in this room so far. */
  turnCount: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);

  // userId -> Set of socket IDs
  private userSockets: Map<string, Set<string>> = new Map();
  // socketId -> userId
  private socketToUser: Map<string, string> = new Map();
  // socketId -> current roomId
  private socketToRoom: Map<string, string> = new Map();
  // roomId -> CallRoom
  private rooms: Map<string, CallRoom> = new Map();

  constructor(
    private readonly callsService: CallsService,
    private readonly messagesService: MessagesService,
    private readonly usersService: UsersService,
    private readonly agentsService: AgentsService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);

    // Clean up room participation
    const roomId = this.socketToRoom.get(client.id);
    if (roomId) {
      this.handleLeaveRoomInternal(client, roomId);
    }

    if (userId) {
      this.socketToUser.delete(client.id);
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.broadcastOnlineUsers();
    }
  }

  @SubscribeMessage('register-user')
  handleRegisterUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    if (!data || !data.userId) return;

    this.socketToUser.set(client.id, data.userId);
    if (!this.userSockets.has(data.userId)) {
      this.userSockets.set(data.userId, new Set());
    }
    this.userSockets.get(data.userId)!.add(client.id);

    this.logger.log(`User ${data.userId} registered on socket ${client.id}`);
    this.broadcastOnlineUsers();
  }

  /**
   * Start a direct call or a multi-party group call
   */
  @SubscribeMessage('initiate-call')
  async handleInitiateCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      targetUserIds: string[];
      callType: 'audio' | 'video';
      title?: string;
      topic?: string;
      topicId?: string;
      topicDetail?: { source?: string; keyFigure?: string; openQuestion?: string };
      callerInfo: {
        id: string;
        displayName: string;
        avatar: string;
        username: string;
        isAgent?: boolean;
        role?: string;
        accentColor?: string;
      };
    },
  ) {
    const callerId = this.socketToUser.get(client.id);
    if (!callerId) return;

    const roomId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const isGroup = data.targetUserIds.length > 1;

    const room: CallRoom = {
      roomId,
      callType: data.callType,
      isGroup,
      title: data.title || (isGroup ? 'Group Conference' : undefined),
      initiatorId: callerId,
      participants: new Map(),
      invitedUserIds: new Set(data.targetUserIds),
      topic: data.topic,
      topicId: data.topicId,
      topicDetail: data.topicDetail,
      turnCount: 0,
    };

    // Add caller to room
    const callerParticipant: RoomParticipant = {
      userId: callerId,
      socketId: client.id,
      displayName: data.callerInfo.displayName,
      avatar: data.callerInfo.avatar,
      username: data.callerInfo.username,
      isAgent: data.callerInfo.isAgent,
      role: data.callerInfo.role,
      accentColor: data.callerInfo.accentColor,
    };
    room.participants.set(client.id, callerParticipant);
    client.join(roomId);
    this.socketToRoom.set(client.id, roomId);
    this.rooms.set(roomId, room);

    // Confirm initiation to caller
    client.emit('call-initiated', {
      roomId,
      callType: data.callType,
      isGroup,
      title: room.title,
      topic: room.topic,
    });

    // Notify all target recipients
    for (const targetUserId of data.targetUserIds) {
      this.emitToUser(targetUserId, 'incoming-call', {
        roomId,
        fromUserId: callerId,
        callType: data.callType,
        isGroup,
        title: room.title,
        callerInfo: data.callerInfo,
        currentParticipants: [data.callerInfo],
        topic: room.topic,
        topicId: room.topicId,
        topicDetail: room.topicDetail,
      });
    }

    this.pushObservatory('call-initiated', {
      roomId,
      topic: room.topic,
      initiator: callerParticipant,
      invitedUserIds: data.targetUserIds,
    });
  }

  /**
   * Merge call / Invite more participants to active call
   */
  @SubscribeMessage('merge-call')
  async handleMergeCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      roomId: string;
      targetUserIds: string[];
    },
  ) {
    const inviterId = this.socketToUser.get(client.id);
    const room = this.rooms.get(data.roomId);
    if (!room || !inviterId) return;

    room.isGroup = true;
    if (!room.title) room.title = 'Merged Conference';

    const inviterParticipant = room.participants.get(client.id);
    const currentParticipantsList = Array.from(room.participants.values()).map(p => ({
      id: p.userId,
      displayName: p.displayName,
      avatar: p.avatar,
      username: p.username,
    }));

    for (const targetUserId of data.targetUserIds) {
      room.invitedUserIds.add(targetUserId);
      this.emitToUser(targetUserId, 'incoming-call', {
        roomId: room.roomId,
        fromUserId: inviterId,
        callType: room.callType,
        isGroup: true,
        isMerge: true,
        title: room.title,
        callerInfo: inviterParticipant,
        currentParticipants: currentParticipantsList,
      });
    }

    // Inform current participants in room that new users were invited to merge
    this.server.to(room.roomId).emit('participants-invited', {
      targetUserIds: data.targetUserIds,
      isGroup: true,
    });
  }

  /**
   * Join an active call room (Answer call)
   */
  @SubscribeMessage('join-call-room')
  handleJoinCallRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      roomId: string;
      userInfo: {
        id: string;
        displayName: string;
        avatar: string;
        username: string;
        isAgent?: boolean;
        role?: string;
        accentColor?: string;
      };
    },
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) {
      client.emit('call-failed', { message: 'Call room no longer exists or has ended' });
      return;
    }

    if (!room.startedAt) {
      room.startedAt = new Date();
    }

    const participant: RoomParticipant = {
      userId: data.userInfo.id,
      socketId: client.id,
      displayName: data.userInfo.displayName,
      avatar: data.userInfo.avatar,
      username: data.userInfo.username,
      isAgent: data.userInfo.isAgent,
      role: data.userInfo.role,
      accentColor: data.userInfo.accentColor,
    };

    // Get list of existing peers in the room before adding the new participant
    const existingParticipants = Array.from(room.participants.values()).filter(p => p.socketId !== client.id);

    client.join(room.roomId);
    room.participants.set(client.id, participant);
    this.socketToRoom.set(client.id, room.roomId);

    // Send existing peers to the newcomer so the newcomer can initiate WebRTC offers to them
    client.emit('room-existing-participants', {
      roomId: room.roomId,
      callType: room.callType,
      isGroup: room.isGroup,
      title: room.title,
      topic: room.topic,
      topicId: room.topicId,
      topicDetail: room.topicDetail,
      participants: existingParticipants,
    });

    // Notify all existing peers in the room about the newcomer
    client.to(room.roomId).emit('new-participant-joined', {
      participant,
      roomId: room.roomId,
      isGroup: room.participants.size > 2,
    });

    this.pushObservatory('participant-joined', {
      roomId: room.roomId,
      participant,
    });
  }

  /**
   * Relay WebRTC signals (SDP offer/answer, ICE candidates) between peers in mesh
   */
  @SubscribeMessage('signal-peer')
  handleSignalPeer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      toSocketId: string;
      signal: any;
      userInfo?: any;
    },
  ) {
    this.server.to(data.toSocketId).emit('peer-signal', {
      fromSocketId: client.id,
      signal: data.signal,
      userInfo: data.userInfo,
    });
  }

  /**
   * Decline an incoming call
   */
  @SubscribeMessage('decline-call')
  handleDeclineCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; reason?: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    const room = this.rooms.get(data.roomId);
    if (room && userId) {
      client.to(data.roomId).emit('call-declined', {
        fromUserId: userId,
        reason: data.reason || 'Call declined',
      });
      // If 1-on-1 and callee declined, record as rejected
      if (room.participants.size <= 1) {
        this.callsService.createCallRecord({
          callerId: room.initiatorId,
          calleeId: userId,
          callType: room.callType,
          status: 'rejected',
          duration: 0,
        }).catch(err => this.logger.error('Failed to log rejected call', err));
        this.rooms.delete(data.roomId);
      }
    }
  }

  /**
   * Leave call room
   */
  @SubscribeMessage('leave-call-room')
  handleLeaveCallRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.handleLeaveRoomInternal(client, data.roomId);
  }

  private handleLeaveRoomInternal(client: Socket, roomId: string) {
    const room = this.rooms.get(roomId);
    const userId = this.socketToUser.get(client.id);

    client.leave(roomId);
    this.socketToRoom.delete(client.id);

    if (room) {
      room.participants.delete(client.id);
      client.to(roomId).emit('participant-left', {
        socketId: client.id,
        userId,
      });

      // If less than 2 participants left, record call log and cleanup
      if (room.participants.size <= 1) {
        const duration = room.startedAt ? Math.round((Date.now() - room.startedAt.getTime()) / 1000) : 0;
        const lastParticipant = room.participants.values().next().value;
        const calleeId = lastParticipant ? lastParticipant.userId : (Array.from(room.invitedUserIds)[0] || room.initiatorId);

        this.callsService.createCallRecord({
          callerId: room.initiatorId,
          calleeId,
          callType: room.callType,
          status: duration > 0 ? 'completed' : 'cancelled',
          duration,
          isGroup: room.isGroup,
          groupTitle: room.title,
          participantCount: Math.max(room.invitedUserIds.size + 1, 2),
          startedAt: room.startedAt || new Date(),
          endedAt: new Date(),
        }).catch(err => this.logger.error('Failed to save call log', err));

        // If 1 person left, notify them call has ended
        if (lastParticipant) {
          this.server.to(lastParticipant.socketId).emit('call-ended', {
            roomId,
            reason: 'All other participants have left',
          });
          const lastSocket = this.server.sockets.sockets.get(lastParticipant.socketId);
          if (lastSocket) {
            lastSocket.leave(roomId);
            this.socketToRoom.delete(lastParticipant.socketId);
          }
        }
        this.rooms.delete(roomId);
        this.pushObservatory('call-ended', { roomId, duration });
      }
    }

    this.pushObservatory('participant-left', { roomId, userId });
  }

  /**
   * Sync media states (Audio muted, Video turned off, Screen sharing)
   */
  @SubscribeMessage('toggle-media')
  handleToggleMedia(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isMuted?: boolean; isVideoOff?: boolean; isScreenSharing?: boolean },
  ) {
    const fromUserId = this.socketToUser.get(client.id);
    client.to(data.roomId).emit('participant-media-changed', {
      socketId: client.id,
      fromUserId,
      ...data,
    });
  }

  /**
   * Put call on hold or resume
   */
  @SubscribeMessage('call-hold')
  handleCallHold(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isHeld: boolean },
  ) {
    const fromUserId = this.socketToUser.get(client.id);
    client.to(data.roomId).emit('peer-hold-status', {
      socketId: client.id,
      fromUserId,
      isHeld: data.isHeld,
    });
  }

  /**
   * Merge a held call with an active call room
   */
  @SubscribeMessage('merge-held-call')
  handleMergeHeldCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { activeRoomId: string; heldRoomId: string },
  ) {
    client.to(data.heldRoomId).emit('transfer-to-room', {
      newRoomId: data.activeRoomId,
    });
  }

  /**
   * Hang up a specific call room (e.g. held call)
   */
  @SubscribeMessage('end-specific-call')
  handleEndSpecificCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.handleLeaveRoomInternal(client, data.roomId);
  }

  /**
   * Chat messages
   */
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toUserId: string; content?: string; images?: string[] },
  ) {
    const senderId = this.socketToUser.get(client.id);
    const content = (data.content ?? '').trim();
    // Only already-hosted images travel over the socket; uploads go through POST /api/uploads first.
    const images = (Array.isArray(data.images) ? data.images : [])
      .filter((u) => typeof u === 'string' && /^(https?:\/\/|\/uploads\/)/.test(u))
      .slice(0, 4);
    if (!senderId || (!content && images.length === 0)) return;

    const savedMsg = await this.messagesService.saveMessage(senderId, data.toUserId, content, images);
    // Agents that receive DMs decide whether to answer based on who wrote - humans yes, agents no (no loops).
    const sender = await this.usersService.findById(senderId).catch(() => null);
    const enriched = {
      ...savedMsg,
      sender: sender
        ? { id: sender.id, username: sender.username, displayName: sender.displayName, avatar: sender.avatar, isAgent: !!sender.isAgent }
        : undefined,
    };
    this.emitToUser(data.toUserId, 'new-message', enriched);
    client.emit('message-sent', savedMsg);
  }

  @SubscribeMessage('delete-message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; toUserId?: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId || !data.messageId) return;

    await this.messagesService.deleteMessage(data.messageId, userId);
    client.emit('message-deleted', { messageId: data.messageId });
    if (data.toUserId) {
      this.emitToUser(data.toUserId, 'message-deleted', { messageId: data.messageId });
    }
  }

  @SubscribeMessage('clear-chat')
  async handleClearChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { otherUserId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId || !data.otherUserId) return;

    await this.messagesService.clearConversation(userId, data.otherUserId);
    client.emit('chat-cleared', { otherUserId: data.otherUserId });
    this.emitToUser(data.otherUserId, 'chat-cleared', { otherUserId: userId });
  }

  public emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, payload);
      }
    }
  }

  private broadcastOnlineUsers() {
    const onlineUserIds = Array.from(this.userSockets.keys());
    this.server.emit('online-users', onlineUserIds);
    this.pushObservatory('presence', { onlineUserIds });
  }

  // ===========================================================================
  // Agent conversations
  // ===========================================================================

  /**
   * An agent speaks.
   *
   * This is the agent equivalent of transmitting audio: instead of RTP flowing
   * peer-to-peer, the utterance is relayed through the gateway to everyone in
   * the room. The gateway is the single source of truth for speaking order -
   * it stamps each utterance with the room's sorted participant list, so every
   * agent derives the same next speaker without any central baton.
   */
  @SubscribeMessage('agent-utterance')
  async handleAgentUtterance(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      text: string;
      brain?: string;
      model?: string | null;
      latencyMs?: number;
    },
  ) {
    const speakerId = this.socketToUser.get(client.id);
    const room = this.rooms.get(data.roomId);
    if (!room || !speakerId || !data.text?.trim()) return;

    const speaker = room.participants.get(client.id);
    if (!speaker) return;

    const turnIndex = room.turnCount;
    room.turnCount++;

    const participants = Array.from(room.participants.values());
    // Deterministic, identical on every client: sort by userId.
    const order = participants.map((p) => p.userId).sort();
    const listenerIds = order.filter((id) => id !== speakerId);

    const payload = {
      roomId: room.roomId,
      topic: room.topic,
      speakerId,
      speakerName: speaker.displayName,
      speakerUsername: speaker.username,
      speakerRole: speaker.role || '',
      accentColor: speaker.accentColor || '#6366f1',
      text: data.text.trim(),
      turnIndex,
      order,
      brain: data.brain ?? 'unknown',
      model: data.model ?? null,
      latencyMs: data.latencyMs ?? 0,
      spokenAt: new Date().toISOString(),
    };

    // Everyone in the room, including the speaker, so all transcripts match.
    this.server.to(room.roomId).emit('room-utterance', payload);
    this.pushObservatory('utterance', payload);

    this.agentsService
      .recordTurn({
        roomId: room.roomId,
        speakerId,
        speakerName: speaker.displayName,
        speakerUsername: speaker.username,
        speakerRole: speaker.role || '',
        turnIndex,
        content: payload.text,
        topic: room.topic,
        listenerIds,
        brain: data.brain ?? 'unknown',
        model: data.model ?? undefined,
        latencyMs: data.latencyMs ?? 0,
      })
      .catch((err) => this.logger.error('Failed to persist agent turn', err));
  }

  // ===========================================================================
  // Observatory
  // ===========================================================================

  /** A viewer of the Observatory page subscribes to the live feed. */
  @SubscribeMessage('observer-subscribe')
  handleObserverSubscribe(@ConnectedSocket() client: Socket) {
    client.join(OBSERVATORY_ROOM);
    client.emit('observatory-snapshot', this.getObservatorySnapshot());
  }

  @SubscribeMessage('observer-unsubscribe')
  handleObserverUnsubscribe(@ConnectedSocket() client: Socket) {
    client.leave(OBSERVATORY_ROOM);
  }

  @SubscribeMessage('observer-refresh')
  handleObserverRefresh(@ConnectedSocket() client: Socket) {
    client.emit('observatory-snapshot', this.getObservatorySnapshot());
  }

  /**
   * Live view of who is on a call with whom, right now. Derived from in-memory
   * room state, so it reflects the signalling layer rather than the database.
   */
  public getObservatorySnapshot() {
    const rooms = Array.from(this.rooms.values()).map((room) => ({
      roomId: room.roomId,
      title: room.title ?? null,
      topic: room.topic ?? null,
      topicId: room.topicId ?? null,
      callType: room.callType,
      isGroup: room.isGroup,
      initiatorId: room.initiatorId,
      startedAt: room.startedAt ? room.startedAt.toISOString() : null,
      turnCount: room.turnCount,
      invitedUserIds: Array.from(room.invitedUserIds),
      participants: Array.from(room.participants.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        isAgent: !!p.isAgent,
        role: p.role ?? '',
        accentColor: p.accentColor ?? '#6366f1',
      })),
    }));

    return {
      onlineUserIds: Array.from(this.userSockets.keys()),
      activeRooms: rooms,
      generatedAt: new Date().toISOString(),
    };
  }

  private pushObservatory(event: string, detail: any) {
    this.server.to(OBSERVATORY_ROOM).emit('observatory-event', {
      event,
      detail,
      at: new Date().toISOString(),
    });
    this.server
      .to(OBSERVATORY_ROOM)
      .emit('observatory-snapshot', this.getObservatorySnapshot());
  }
}
