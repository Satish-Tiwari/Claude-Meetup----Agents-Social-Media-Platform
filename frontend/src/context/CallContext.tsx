import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User, CallType, CallStatus, Participant, HeldCallSession } from '../types';
import { playRingtone, playDialTone, playCallEndedTone, stopAllSounds } from '../utils/sound';

interface IncomingCallData {
  roomId: string;
  fromUserId: string;
  callType: CallType;
  isGroup?: boolean;
  isMerge?: boolean;
  title?: string;
  callerInfo: {
    id: string;
    displayName: string;
    avatar: string;
    username: string;
  };
  currentParticipants?: Array<{
    id: string;
    displayName: string;
    avatar: string;
    username: string;
  }>;
}

interface CallContextType {
  callStatus: CallStatus;
  callType: CallType;
  isGroup: boolean;
  roomTitle: string;
  roomId: string | null;
  participants: Participant[];
  localStream: MediaStream | null;
  incomingCall: IncomingCallData | null;
  heldCall: HeldCallSession | null;
  isOnHoldByRemote: boolean;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  callDuration: number;
  startCall: (targetUsers: User | User[], type: CallType, title?: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  mergeNewCall: (targetUsers: User[]) => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  holdAndAcceptNewCall: () => Promise<void>;
  endCurrentAndAcceptNewCall: () => Promise<void>;
  swapHeldAndActiveCall: () => Promise<void>;
  mergeHeldCallIntoActive: () => Promise<void>;
  endHeldCall: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callType, setCallType] = useState<CallType>('video');
  const [isGroup, setIsGroup] = useState<boolean>(false);
  const [roomTitle, setRoomTitle] = useState<string>('');
  const [roomId, setRoomId] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [heldCall, setHeldCall] = useState<HeldCallSession | null>(null);
  const [isOnHoldByRemote, setIsOnHoldByRemote] = useState<boolean>(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  const [callDuration, setCallDuration] = useState<number>(0);

  // Mesh Peer Connections: remoteSocketId -> RTCPeerConnection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const candidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callTimerRef = useRef<any>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const callStatusRef = useRef<CallStatus>('idle');

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Request user media
  const getUserMediaStream = async (type: CallType): Promise<MediaStream> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = `Camera/Microphone access requires HTTPS on mobile browsers.\nPlease open via https://${window.location.hostname}:3443`;
      alert(msg);
      throw new Error(msg);
    }
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsAudioMuted(false);
      setIsVideoOff(type === 'audio');
      return stream;
    } catch (err) {
      console.warn('Fallback to audio-only stream', err);
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = audioStream;
      setLocalStream(audioStream);
      setIsAudioMuted(false);
      setIsVideoOff(true);
      return audioStream;
    }
  };

  // Create an RTCPeerConnection with a specific peer
  const createPeerConnection = useCallback((remoteSocketId: string, participantInfo: any) => {
    if (peerConnections.current.has(remoteSocketId)) {
      peerConnections.current.get(remoteSocketId)?.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Relay ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('signal-peer', {
          toSocketId: remoteSocketId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    // Receive remote audio/video tracks
    pc.ontrack = (event) => {
      let stream = event.streams && event.streams[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      }

      const updateParticipantStream = () => {
        // Create fresh MediaStream with all current tracks so React state references update
        const freshStream = new MediaStream(stream!.getTracks());
        setParticipants((prev) => {
          const index = prev.findIndex((p) => p.socketId === remoteSocketId);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              stream: freshStream,
              displayName: updated[index].displayName || participantInfo.displayName || 'Participant',
              avatar: updated[index].avatar || participantInfo.avatar || '',
              username: updated[index].username || participantInfo.username || '',
            };
            return updated;
          }
          return [
            ...prev,
            {
              socketId: remoteSocketId,
              userId: participantInfo.userId || participantInfo.id || remoteSocketId,
              displayName: participantInfo.displayName || 'Participant',
              avatar: participantInfo.avatar || '',
              username: participantInfo.username || '',
              stream: freshStream,
            },
          ];
        });
      };

      updateParticipantStream();
      event.track.onunmute = () => {
        updateParticipantStream();
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        stopAllSounds();
        setCallStatus('connected');
        startCallTimer();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removeParticipant(remoteSocketId);
      }
    };

    peerConnections.current.set(remoteSocketId, pc);
    return pc;
  }, [socket]);

  const removeParticipant = (socketId: string) => {
    if (peerConnections.current.has(socketId)) {
      peerConnections.current.get(socketId)?.close();
      peerConnections.current.delete(socketId);
    }
    candidateQueues.current.delete(socketId);
    setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
  };

  // Timer helpers
  const startCallTimer = () => {
    if (callTimerRef.current) return;
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  // Full cleanup
  const handleCleanup = useCallback(() => {
    stopAllSounds();
    stopCallTimer();

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    candidateQueues.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (originalVideoTrackRef.current) {
      originalVideoTrackRef.current.stop();
      originalVideoTrackRef.current = null;
    }
    setLocalStream(null);

    setParticipants([]);
    setIncomingCall(null);
    setHeldCall(null);
    setIsOnHoldByRemote(false);
    setCallStatus('idle');
    setRoomId(null);
    setIsScreenSharing(false);
    setIsAudioMuted(false);
    setIsVideoOff(false);
  }, []);

  // Socket Event Listeners for Room Signaling
  useEffect(() => {
    if (!socket || !user) return;

    // Incoming Call (1-on-1, Group, Merge, or Call Waiting)
    socket.on('incoming-call', (data: IncomingCallData) => {
      setIncomingCall(data);
      // If NOT already connected, switch status to 'ringing' and play main ringtone
      // If ALREADY connected, stay in 'connected' and show Call Waiting overlay!
      if (callStatusRef.current !== 'connected') {
        setCallStatus('ringing');
        setCallType(data.callType);
        setIsGroup(!!data.isGroup);
        setRoomTitle(data.title || (data.isGroup ? 'Group Conference' : data.callerInfo.displayName));
      }
      playRingtone();
    });

    // Call Initiated confirmation
    socket.on('call-initiated', (data: { roomId: string; callType: CallType; isGroup: boolean; title?: string }) => {
      setRoomId(data.roomId);
      setCallType(data.callType);
      setIsGroup(data.isGroup);
      setRoomTitle(data.title || (data.isGroup ? 'Group Conference' : 'Calling...'));
    });

    // Existing participants in the room when newly joined
    socket.on('room-existing-participants', async (data: {
      roomId: string;
      callType: CallType;
      isGroup: boolean;
      title?: string;
      participants: any[];
    }) => {
      setRoomId(data.roomId);
      setCallType(data.callType);
      setIsGroup(data.isGroup);
      if (data.title) setRoomTitle(data.title);

      // Register existing participants immediately so tiles render
      setParticipants(
        data.participants.map((p) => ({
          socketId: p.socketId,
          userId: p.userId || p.id,
          displayName: p.displayName || 'Participant',
          avatar: p.avatar || '',
          username: p.username || '',
        }))
      );

      const stream = localStreamRef.current || (await getUserMediaStream(data.callType));

      // Initiate WebRTC offers to each existing peer in the room
      for (const peer of data.participants) {
        const pc = createPeerConnection(peer.socketId, peer);

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('signal-peer', {
          toSocketId: peer.socketId,
          signal: { type: 'offer', sdp: offer },
          userInfo: {
            id: user.id,
            displayName: user.displayName,
            avatar: user.avatar,
            username: user.username,
          },
        });
      }

      setCallStatus('connected');
      startCallTimer();
    });

    // New participant joined the room
    socket.on('new-participant-joined', (data: { participant: any; roomId: string; isGroup: boolean }) => {
      setIsGroup(data.isGroup);
      setParticipants((prev) => {
        if (prev.some((p) => p.socketId === data.participant.socketId)) return prev;
        return [
          ...prev,
          {
            socketId: data.participant.socketId,
            userId: data.participant.userId || data.participant.id,
            displayName: data.participant.displayName || 'Participant',
            avatar: data.participant.avatar || '',
            username: data.participant.username || '',
          },
        ];
      });
    });

    // Peer Signal (Offer, Answer, ICE Candidate)
    socket.on('peer-signal', async (data: { fromSocketId: string; signal: any; userInfo?: any }) => {
      const { fromSocketId, signal, userInfo } = data;

      if (signal.type === 'offer') {
        let pc = peerConnections.current.get(fromSocketId);
        if (!pc) {
          pc = createPeerConnection(fromSocketId, userInfo || {});
          const stream = localStreamRef.current || (await getUserMediaStream(callType));
          stream.getTracks().forEach((track) => {
            pc!.addTrack(track, stream);
          });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        const queue = candidateQueues.current.get(fromSocketId) || [];
        for (const cand of queue) {
          if (cand) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        }
        candidateQueues.current.delete(fromSocketId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('signal-peer', {
          toSocketId: fromSocketId,
          signal: { type: 'answer', sdp: answer },
          userInfo: {
            id: user.id,
            displayName: user.displayName,
            avatar: user.avatar,
            username: user.username,
          },
        });

        stopAllSounds();
        setCallStatus('connected');
        startCallTimer();
      } else if (signal.type === 'answer') {
        const pc = peerConnections.current.get(fromSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          const queue = candidateQueues.current.get(fromSocketId) || [];
          for (const cand of queue) {
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
          candidateQueues.current.delete(fromSocketId);
          stopAllSounds();
          setCallStatus('connected');
          startCallTimer();
        }
      } else if (signal.type === 'candidate') {
        if (!signal.candidate) return;
        const pc = peerConnections.current.get(fromSocketId);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        } else {
          if (!candidateQueues.current.has(fromSocketId)) {
            candidateQueues.current.set(fromSocketId, []);
          }
          candidateQueues.current.get(fromSocketId)?.push(signal.candidate);
        }
      }
    });

    // Participant Left
    socket.on('participant-left', (data: { socketId: string; userId: string }) => {
      removeParticipant(data.socketId);
    });

    // Entire Call Ended
    socket.on('call-ended', () => {
      stopAllSounds();
      playCallEndedTone();
      handleCleanup();
    });

    socket.on('call-declined', ({ reason }: { reason: string }) => {
      if (participants.length === 0) {
        stopAllSounds();
        playCallEndedTone();
        alert(`Call declined: ${reason}`);
        handleCleanup();
      }
    });

    socket.on('call-failed', ({ message }: { message: string }) => {
      stopAllSounds();
      playCallEndedTone();
      alert(message);
      handleCleanup();
    });

    // Participant media changed
    socket.on('participant-media-changed', (data: { socketId: string; isMuted?: boolean; isVideoOff?: boolean; isScreenSharing?: boolean }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.socketId === data.socketId
            ? {
                ...p,
                isAudioMuted: data.isMuted !== undefined ? data.isMuted : p.isAudioMuted,
                isVideoOff: data.isVideoOff !== undefined ? data.isVideoOff : p.isVideoOff,
                isScreenSharing: data.isScreenSharing !== undefined ? data.isScreenSharing : p.isScreenSharing,
              }
            : p
        )
      );
    });

    // Remote hold status notification
    socket.on('peer-hold-status', (data: { isHeld: boolean; fromUserId: string }) => {
      setIsOnHoldByRemote(data.isHeld);
    });

    // Transfer to room (upon call merge of held session)
    socket.on('transfer-to-room', async (data: { newRoomId: string }) => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      setParticipants([]);

      setRoomId(data.newRoomId);
      setIsGroup(true);
      setRoomTitle('Merged Conference');

      socket.emit('join-call-room', {
        roomId: data.newRoomId,
        userInfo: {
          id: user.id,
          displayName: user.displayName,
          avatar: user.avatar,
          username: user.username,
        },
      });
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-initiated');
      socket.off('room-existing-participants');
      socket.off('new-participant-joined');
      socket.off('peer-signal');
      socket.off('participant-left');
      socket.off('call-ended');
      socket.off('call-declined');
      socket.off('call-failed');
      socket.off('participant-media-changed');
      socket.off('peer-hold-status');
      socket.off('transfer-to-room');
    };
  }, [socket, user, callType, createPeerConnection, handleCleanup]);

  // Initiate a Call (1-on-1 or Group)
  const startCall = async (targetUsers: User | User[], type: CallType, title?: string) => {
    if (!socket || !user) return;

    const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
    if (targets.length === 0) return;

    const group = targets.length > 1;
    setIsGroup(group);
    setCallType(type);
    setRoomTitle(title || (group ? 'Group Conference' : targets[0].displayName));
    setCallStatus('calling');
    playDialTone();

    await getUserMediaStream(type);

    socket.emit('initiate-call', {
      targetUserIds: targets.map((u) => u.id),
      callType: type,
      title: title || (group ? 'Group Conference' : undefined),
      callerInfo: {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        username: user.username,
      },
    });
  };

  // Accept Incoming Call (Normal when not in call)
  const acceptCall = async () => {
    if (!socket || !incomingCall || !user) return;

    stopAllSounds();
    const type = incomingCall.callType;
    setCallType(type);
    setIsGroup(!!incomingCall.isGroup);
    setRoomTitle(incomingCall.title || incomingCall.callerInfo.displayName);
    setRoomId(incomingCall.roomId);

    await getUserMediaStream(type);

    socket.emit('join-call-room', {
      roomId: incomingCall.roomId,
      userInfo: {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        username: user.username,
      },
    });

    setIncomingCall(null);
  };

  // Reject / Decline Incoming Call
  const rejectCall = (reason = 'Call declined') => {
    if (socket && incomingCall) {
      socket.emit('decline-call', {
        roomId: incomingCall.roomId,
        reason,
      });
    }
    stopAllSounds();
    setIncomingCall(null);
    if (callStatus === 'ringing') {
      setCallStatus('idle');
    }
  };

  // End active call / leave room
  const endCall = () => {
    if (socket && roomId) {
      socket.emit('leave-call-room', { roomId });
    }
    playCallEndedTone();
    handleCleanup();
  };

  // Merge Call / Invite more participants to existing active call
  const mergeNewCall = async (targetUsers: User[]) => {
    if (!socket || !roomId || targetUsers.length === 0) return;

    setIsGroup(true);
    socket.emit('merge-call', {
      roomId,
      targetUserIds: targetUsers.map((u) => u.id),
    });
  };

  /**
   * HOLD CURRENT CALL & ANSWER INCOMING NEW CALL
   */
  const holdAndAcceptNewCall = async () => {
    if (!socket || !incomingCall || !user || !roomId) return;

    stopAllSounds();

    // 1. Notify current room peers that they are being placed on hold
    socket.emit('call-hold', { roomId, isHeld: true });

    // 2. Stash active call as held
    setHeldCall({
      roomId,
      callType,
      isGroup,
      roomTitle,
      participants,
      peerConnections: new Map(peerConnections.current),
      duration: callDuration,
    });

    // 3. Clear active peer connections for new call
    peerConnections.current = new Map();
    candidateQueues.current.clear();
    setParticipants([]);

    // 4. Setup parameters for new incoming call
    const nextRoomId = incomingCall.roomId;
    const nextCallType = incomingCall.callType;
    const nextIsGroup = !!incomingCall.isGroup;
    const nextRoomTitle = incomingCall.title || incomingCall.callerInfo.displayName;

    setRoomId(nextRoomId);
    setCallType(nextCallType);
    setIsGroup(nextIsGroup);
    setRoomTitle(nextRoomTitle);
    setCallDuration(0);

    const stream = localStreamRef.current || (await getUserMediaStream(nextCallType));

    // 5. Join new incoming room
    socket.emit('join-call-room', {
      roomId: nextRoomId,
      userInfo: {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        username: user.username,
      },
    });

    setIncomingCall(null);
  };

  /**
   * END CURRENT CALL & ANSWER INCOMING NEW CALL
   */
  const endCurrentAndAcceptNewCall = async () => {
    if (!socket || !incomingCall || !user) return;

    stopAllSounds();

    // Hang up current call
    if (roomId) {
      socket.emit('leave-call-room', { roomId });
    }
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    candidateQueues.current.clear();
    setParticipants([]);

    // Join new incoming call
    const nextRoomId = incomingCall.roomId;
    const nextCallType = incomingCall.callType;
    const nextIsGroup = !!incomingCall.isGroup;
    const nextRoomTitle = incomingCall.title || incomingCall.callerInfo.displayName;

    setRoomId(nextRoomId);
    setCallType(nextCallType);
    setIsGroup(nextIsGroup);
    setRoomTitle(nextRoomTitle);
    setCallDuration(0);

    const stream = localStreamRef.current || (await getUserMediaStream(nextCallType));

    socket.emit('join-call-room', {
      roomId: nextRoomId,
      userInfo: {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        username: user.username,
      },
    });

    setIncomingCall(null);
  };

  /**
   * SWAP HELD CALL AND ACTIVE CALL
   */
  const swapHeldAndActiveCall = async () => {
    if (!heldCall || !roomId || !socket) return;

    // 1. Put current active call on hold
    socket.emit('call-hold', { roomId, isHeld: true });

    const currentToHold: HeldCallSession = {
      roomId,
      callType,
      isGroup,
      roomTitle,
      participants,
      peerConnections: new Map(peerConnections.current),
      duration: callDuration,
    };

    // 2. Restore held call
    const restored = heldCall;
    peerConnections.current = restored.peerConnections;
    setParticipants(restored.participants);
    setRoomId(restored.roomId);
    setCallType(restored.callType);
    setIsGroup(!!restored.isGroup);
    setRoomTitle(restored.roomTitle);
    setCallDuration(restored.duration);

    // 3. Inform peers in restored room that call is resumed
    socket.emit('call-hold', { roomId: restored.roomId, isHeld: false });

    // 4. Update held state
    setHeldCall(currentToHold);
  };

  /**
   * MERGE HELD CALL INTO ACTIVE CALL (Conference merge)
   */
  const mergeHeldCallIntoActive = async () => {
    if (!heldCall || !roomId || !socket) return;

    socket.emit('merge-held-call', {
      activeRoomId: roomId,
      heldRoomId: heldCall.roomId,
    });

    setIsGroup(true);
    setRoomTitle('Merged Conference');
    setHeldCall(null);
  };

  /**
   * END HELD CALL SPECIFICALLY
   */
  const endHeldCall = () => {
    if (!heldCall || !socket) return;
    socket.emit('end-specific-call', { roomId: heldCall.roomId });
    heldCall.peerConnections.forEach((pc) => pc.close());
    setHeldCall(null);
  };

  // Toggle Audio Mute
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const muted = !audioTrack.enabled;
        setIsAudioMuted(muted);
        if (socket && roomId) {
          socket.emit('toggle-media', { roomId, isMuted: muted });
        }
      }
    }
  };

  // Toggle Video On/Off
  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const off = !videoTrack.enabled;
      setIsVideoOff(off);
      if (socket && roomId) {
        socket.emit('toggle-media', { roomId, isVideoOff: off });
      }
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        const newTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newTrack);

        peerConnections.current.forEach((pc, remoteSocketId) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, localStreamRef.current!);
            pc.createOffer().then((offer) => {
              pc.setLocalDescription(offer);
              socket?.emit('signal-peer', {
                toSocketId: remoteSocketId,
                signal: { type: 'offer', sdp: offer },
                userInfo: {
                  id: user?.id,
                  displayName: user?.displayName,
                  avatar: user?.avatar,
                  username: user?.username,
                },
              });
            });
          }
        });

        const newLocalStream = new MediaStream(localStreamRef.current.getTracks());
        localStreamRef.current = newLocalStream;
        setLocalStream(newLocalStream);
        setIsVideoOff(false);
        setCallType('video');
        if (socket && roomId) {
          socket.emit('toggle-media', { roomId, isVideoOff: false });
        }
      } catch (err) {
        console.warn('Failed to add video track', err);
      }
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) return;

        // Remember existing camera track so we can restore it when screen share stops
        if (localStreamRef.current) {
          const currentVideo = localStreamRef.current.getVideoTracks()[0];
          if (currentVideo && currentVideo !== screenTrack) {
            originalVideoTrackRef.current = currentVideo;
          }
        }

        // Replace or add track to all active peer connections
        peerConnections.current.forEach((pc, remoteSocketId) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, screenStream);
            pc.createOffer().then((offer) => {
              pc.setLocalDescription(offer);
              socket?.emit('signal-peer', {
                toSocketId: remoteSocketId,
                signal: { type: 'offer', sdp: offer },
                userInfo: {
                  id: user?.id,
                  displayName: user?.displayName,
                  avatar: user?.avatar,
                  username: user?.username,
                },
              });
            });
          }
        });

        // Update localStream so the user immediately sees what they are sharing in their local tile
        const audioTracks = localStreamRef.current ? localStreamRef.current.getAudioTracks() : [];
        const newLocalStream = new MediaStream([...audioTracks, screenTrack]);
        localStreamRef.current = newLocalStream;
        setLocalStream(newLocalStream);
        setIsScreenSharing(true);
        setIsVideoOff(false);

        // System notification / button in OS (when user clicks "Stop sharing" in browser toolbar)
        screenTrack.onended = () => {
          stopScreenSharing();
        };

        if (socket && roomId) {
          socket.emit('toggle-media', { roomId, isScreenSharing: true, isVideoOff: false });
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.warn('Screen share failed or cancelled', err);
        }
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = async () => {
    try {
      let cameraTrack = originalVideoTrackRef.current;

      // If camera track was ended or missing and this is a video call, request camera again
      if ((!cameraTrack || cameraTrack.readyState === 'ended') && callType === 'video') {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          });
          cameraTrack = camStream.getVideoTracks()[0];
          originalVideoTrackRef.current = cameraTrack;
        } catch (e) {
          console.warn('Could not re-acquire camera video track', e);
          cameraTrack = null;
        }
      }

      // Stop any screen tracks still active in local stream
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          if (track !== cameraTrack) {
            track.stop();
          }
        });
      }

      // Restore camera track to all peer connections
      peerConnections.current.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          if (cameraTrack && cameraTrack.readyState === 'live') {
            videoSender.replaceTrack(cameraTrack);
          } else {
            videoSender.replaceTrack(null);
          }
        }
      });

      // Restore local stream
      const audioTracks = localStreamRef.current ? localStreamRef.current.getAudioTracks() : [];
      const restoredTracks: MediaStreamTrack[] = [...audioTracks];
      if (cameraTrack && cameraTrack.readyState === 'live') {
        restoredTracks.push(cameraTrack);
        setIsVideoOff(false);
      } else {
        setIsVideoOff(true);
      }
      const restoredStream = new MediaStream(restoredTracks);
      localStreamRef.current = restoredStream;
      setLocalStream(restoredStream);

      setIsScreenSharing(false);
      if (socket && roomId) {
        socket.emit('toggle-media', {
          roomId,
          isScreenSharing: false,
          isVideoOff: !cameraTrack || cameraTrack.readyState !== 'live',
        });
      }
    } catch (err) {
      console.error('Error stopping screen share', err);
      setIsScreenSharing(false);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callStatus,
        callType,
        isGroup,
        roomTitle,
        roomId,
        participants,
        localStream,
        incomingCall,
        heldCall,
        isOnHoldByRemote,
        isAudioMuted,
        isVideoOff,
        isScreenSharing,
        callDuration,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        mergeNewCall,
        toggleAudio,
        toggleVideo,
        toggleScreenShare,
        holdAndAcceptNewCall,
        endCurrentAndAcceptNewCall,
        swapHeldAndActiveCall,
        mergeHeldCallIntoActive,
        endHeldCall,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};
