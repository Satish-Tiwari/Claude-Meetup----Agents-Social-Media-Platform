import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from '../../context/CallContext';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types';
import { CallDurationTimer } from './CallDurationTimer';
import { MergeCallModal } from './MergeCallModal';
import { CallWaitingBanner } from './CallWaitingBanner';
import { HeldCallBar } from './HeldCallBar';
import { RemoteHoldBanner } from './RemoteHoldBanner';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  Maximize2,
  Minimize2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

interface ActiveCallModalProps {
  availableUsers: User[];
}

// Subcomponent to render individual remote video track
const ParticipantTile: React.FC<{
  stream?: MediaStream;
  displayName: string;
  avatar: string;
  isAudioMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  callType: 'audio' | 'video';
}> = ({ stream, displayName, avatar, isAudioMuted, isVideoOff, isScreenSharing, callType }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Use callback ref to guarantee video element gets srcObject immediately upon mounting!
  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && stream) {
        if (node.srcObject !== stream) {
          node.srcObject = stream;
        }
        node.play().catch((err) => {
          console.log('Participant video autoplay:', err);
        });
      }
    },
    [stream]
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [stream, isVideoOff, isScreenSharing]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === tileRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!tileRef.current) return;
    if (!document.fullscreenElement) {
      tileRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const hasVideoTrack = !!stream && stream.getVideoTracks().length > 0;
  const showVideo = (isScreenSharing || (callType === 'video' && !isVideoOff)) && hasVideoTrack;

  return (
    <div
      ref={tileRef}
      className={`relative w-full h-full bg-[#101726] border ${
        isScreenSharing ? 'border-cyan-500/50 shadow-cyan-500/10' : 'border-[#1f2d45]'
      } rounded-2xl overflow-hidden flex items-center justify-center shadow-lg group transition-all duration-300`}
    >
      {/* Video element is ALWAYS in DOM so audio track continuously plays without interruption */}
      <video
        ref={attachVideo}
        autoPlay
        playsInline
        className={`w-full h-full ${showVideo ? 'block' : 'hidden'} ${
          isScreenSharing ? 'object-contain bg-[#070b12]' : 'object-cover'
        }`}
      />

      {/* Fallback avatar / equalizer when camera is off or voice call */}
      {!showVideo && (
        <div className="flex flex-col items-center justify-center p-4 text-center select-none">
          <div className="relative mb-3">
            <img
              src={avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500/50 shadow-md"
            />
            {/* Audio Wave Equalizer for voice calls */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-[#0a0f18] px-2 py-1 rounded-full border border-indigo-500/30">
              <span className="w-1 bg-indigo-400 rounded-full animate-eq-1"></span>
              <span className="w-1 bg-cyan-400 rounded-full animate-eq-2"></span>
              <span className="w-1 bg-indigo-400 rounded-full animate-eq-3"></span>
              <span className="w-1 bg-cyan-400 rounded-full animate-eq-4"></span>
              <span className="w-1 bg-indigo-400 rounded-full animate-eq-5"></span>
            </div>
          </div>
          <p className="text-sm font-semibold text-white truncate max-w-[140px]">{displayName}</p>
          <p className="text-[11px] text-slate-400">
            {callType === 'audio' ? 'Voice connected' : 'Camera off'}
          </p>
        </div>
      )}

      {/* Screen Sharing Active Badge */}
      {isScreenSharing && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/90 text-white text-xs font-semibold backdrop-blur-md shadow-lg z-10 animate-fade-in">
          <ScreenShare size={13} className="animate-pulse" />
          <span>{displayName}'s Screen</span>
        </div>
      )}

      {/* Fullscreen Tile Button (Appears on hover or when screen sharing) */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition duration-200 z-10 backdrop-blur-sm"
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>

      {/* Name and Mute indicator overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs z-10">
        <span className="text-white font-medium truncate max-w-[140px]">
          {displayName} {isScreenSharing ? '(Presenting)' : ''}
        </span>
        {isAudioMuted && (
          <span className="p-1 rounded bg-rose-500/80 text-white" title="Muted">
            <MicOff size={12} />
          </span>
        )}
      </div>
    </div>
  );
};

export const ActiveCallModal: React.FC<ActiveCallModalProps> = ({ availableUsers }) => {
  const { user: currentUser } = useAuth();
  const {
    callStatus,
    callType,
    isGroup,
    roomTitle,
    participants,
    localStream,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    callDuration,
    endCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useCall();

  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attach local stream reliably via callback ref and effect
  const attachLocalVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      localVideoRef.current = node;
      if (node && localStream) {
        if (node.srcObject !== localStream) {
          node.srcObject = localStream;
        }
        node.play().catch(() => {});
      }
    },
    [localStream]
  );

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, callStatus, isMinimized, isVideoOff, isScreenSharing]);

  if (callStatus === 'idle' || callStatus === 'ringing') {
    return null;
  }

  // OUTGOING CALLING DIAL SCREEN
  if (callStatus === 'calling') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in select-none">
        <div className="bg-[#141e30] border border-[#28395a] rounded-3xl w-full max-w-sm p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl"></div>

          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-500 shadow-xl animate-pulse">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt="Calling"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            {roomTitle || (isGroup ? 'Group Conference' : 'Calling...')}
          </h2>
          <p className="text-xs text-cyan-400 font-medium tracking-wide animate-pulse mb-8">
            {isGroup ? 'Ringing group participants...' : 'Ringing...'}
          </p>

          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 transition flex items-center justify-center text-white shadow-xl shadow-rose-600/30"
            title="Cancel Call"
          >
            <PhoneOff size={26} />
          </button>
        </div>
      </div>
    );
  }

  // MINIMIZED FLOATING CALL WIDGET
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-[#141e30] border border-indigo-500/30 rounded-2xl shadow-2xl p-4 w-80 flex items-center justify-between text-white animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {participants.slice(0, 3).map((p) => (
              <img
                key={p.socketId}
                src={p.avatar}
                alt={p.displayName}
                className="w-9 h-9 rounded-full object-cover border-2 border-[#141e30]"
              />
            ))}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold truncate">{roomTitle}</p>
            <p className="text-[11px] text-cyan-400 font-mono">
              <CallDurationTimer seconds={callDuration} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMinimized(false)}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition"
            title="Maximize"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={endCall}
            className="p-2 bg-rose-600 hover:bg-rose-700 rounded-full text-white transition shadow"
            title="End Call"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Calculate dynamic grid columns based on remote participants count
  const totalCount = participants.length + 1; // including local
  const gridClass =
    totalCount <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : totalCount <= 4
      ? 'grid-cols-2'
      : 'grid-cols-2 lg:grid-cols-3';

  return (
    <div
      data-call-theater="true"
      className="fixed inset-0 z-50 flex flex-col bg-[#070b12] text-slate-100 select-none animate-fade-in"
    >
      {/* Call Waiting Banner (if someone calls while active) */}
      <CallWaitingBanner />

      {/* Held Call Bar (if user put another call on hold) */}
      <HeldCallBar />

      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-[#0f1726]/80 backdrop-blur-md border-b border-[#1f2d45] z-20">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{roomTitle}</h3>
              {isGroup && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-[10px] font-semibold text-indigo-300 flex items-center gap-1">
                  <Users size={11} />
                  <span>{participants.length + 1} in call</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={13} className="text-emerald-400" />
              <span>P2P Encrypted Mesh</span>
              <span>•</span>
              <span className="text-cyan-400 font-mono font-medium">
                <CallDurationTimer seconds={callDuration} />
              </span>
            </div>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2">
          {/* Merge Call quick action */}
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
            title="Merge new user into this call"
          >
            <UserPlus size={14} />
            <span className="hidden sm:inline">Add / Merge Call</span>
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {/* Main Multi-Party Call Grid */}
      <div className="flex-1 p-4 overflow-hidden relative flex items-center justify-center">
        {/* Remote Hold Banner overlay if remote peer put call on hold */}
        <RemoteHoldBanner />
        {participants.length === 0 ? (
          /* Waiting for peers to connect */
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-indigo-500/40 animate-pulse-ring">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt="Local user"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-base font-semibold text-white">Connecting to participants...</p>
            <p className="text-xs text-slate-400">Waiting for peers to join the call room</p>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-3 w-full h-full max-h-[82vh]`}>
            {/* Remote Participants */}
            {participants.map((p) => (
              <ParticipantTile
                key={p.socketId}
                stream={p.stream}
                displayName={p.displayName}
                avatar={p.avatar}
                isAudioMuted={p.isAudioMuted}
                isVideoOff={p.isVideoOff}
                isScreenSharing={p.isScreenSharing}
                callType={callType}
              />
            ))}

            {/* Local Participant Tile */}
            {(() => {
              const hasLocalVideo = !!localStream && localStream.getVideoTracks().length > 0;
              const showLocal = (isScreenSharing || (callType === 'video' && !isVideoOff)) && hasLocalVideo;
              return (
                <div
                  className={`relative w-full h-full bg-[#121a2a] border ${
                    isScreenSharing ? 'border-cyan-500/50 shadow-cyan-500/10' : 'border-indigo-500/40'
                  } rounded-2xl overflow-hidden flex items-center justify-center shadow-lg group transition-all duration-300`}
                >
                  <video
                    ref={attachLocalVideo}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full ${showLocal ? 'block' : 'hidden'} ${
                      isScreenSharing ? 'object-contain bg-[#070b12]' : 'object-cover transform -scale-x-100'
                    }`}
                  />

                  {!showLocal && (
                    <div className="flex flex-col items-center justify-center p-4 text-center select-none">
                      <div className="relative mb-3">
                        <img
                          src={currentUser?.avatar}
                          alt={currentUser?.displayName}
                          className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-md"
                        />
                      </div>
                      <p className="text-sm font-semibold text-white">You</p>
                      <p className="text-[11px] text-slate-400">
                        {callType === 'audio' ? 'Your microphone' : 'Camera off'}
                      </p>
                    </div>
                  )}

                  {/* Local Screen Sharing Badge */}
                  {isScreenSharing && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/90 text-white text-xs font-semibold backdrop-blur-md shadow-lg z-10 animate-fade-in">
                      <ScreenShare size={13} className="animate-pulse" />
                      <span>You are presenting</span>
                    </div>
                  )}

                  {/* Local Tile bottom badge */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs z-10">
                    <span className="text-white font-medium">You {isScreenSharing ? '(Presenting)' : ''}</span>
                    {isAudioMuted && (
                      <span className="p-1 rounded bg-rose-500 text-white">
                        <MicOff size={12} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Floating Bottom Toolbar */}
      <div className="pb-6 pt-2 flex items-center justify-center z-20">
        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-[#141e30]/90 backdrop-blur-xl border border-[#28395a] shadow-2xl">
          {/* Mute Mic */}
          <button
            onClick={toggleAudio}
            className={`p-3.5 rounded-full transition ${
              isAudioMuted
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Toggle Camera */}
          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-full transition ${
              isVideoOff
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          {/* Share Screen */}
          <button
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-full transition ${
              isScreenSharing
                ? 'bg-cyan-500 text-white hover:bg-cyan-600'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          >
            <ScreenShare size={20} />
          </button>

          {/* Merge Call / Add Peer Button */}
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="p-3.5 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white transition shadow-lg shadow-indigo-600/30"
            title="Merge new user into this call"
          >
            <UserPlus size={20} />
          </button>

          {/* End Call */}
          <button
            onClick={endCall}
            className="p-3.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white transition shadow-lg shadow-rose-600/40"
            title="End Call"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      {/* Merge Call Modal */}
      <MergeCallModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        availableUsers={availableUsers}
      />
    </div>
  );
};
