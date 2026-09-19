import React from 'react';
import { useCall } from '../../context/CallContext';
import { Phone, PhoneOff, Video, Users, GitMerge } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, callStatus, acceptCall, rejectCall } = useCall();

  if (callStatus !== 'ringing' || !incomingCall) {
    return null;
  }

  const { callerInfo, callType, isGroup, isMerge, title, currentParticipants } = incomingCall;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="bg-[#141e30] border border-[#28395a] rounded-3xl w-full max-w-sm p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Badge */}
        <div className="mb-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold">
          {isMerge ? (
            <>
              <GitMerge size={13} />
              <span>Call Merge Invitation</span>
            </>
          ) : isGroup ? (
            <>
              <Users size={13} />
              <span>Group Conference Call</span>
            </>
          ) : (
            <>
              {callType === 'video' ? <Video size={13} /> : <Phone size={13} />}
              <span>Incoming {callType === 'video' ? 'Video' : 'Audio'} Call</span>
            </>
          )}
        </div>

        {/* Pulsing Avatar Container */}
        <div className="relative mb-6">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-indigo-500 shadow-xl animate-pulse-ring">
            <img
              src={callerInfo.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={callerInfo.displayName}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-gradient-to-tr from-indigo-600 to-cyan-500 p-2 rounded-full text-white shadow-md">
            {callType === 'video' ? <Video size={18} /> : <Phone size={18} />}
          </div>
        </div>

        {/* Caller Details */}
        <h2 className="text-2xl font-bold text-white mb-1">
          {callerInfo.displayName}
        </h2>
        <p className="text-xs text-slate-400 mb-2">
          {title || `@${callerInfo.username}`}
        </p>

        {/* In-Call Members list if group or merge */}
        {(isGroup || isMerge) && currentParticipants && currentParticipants.length > 0 && (
          <div className="mb-6 w-full p-2.5 bg-[#0a0f18]/70 border border-[#28395a] rounded-2xl">
            <p className="text-[11px] text-slate-400 mb-1.5">Already in call:</p>
            <div className="flex items-center justify-center -space-x-2">
              {currentParticipants.map((p) => (
                <img
                  key={p.id}
                  src={p.avatar}
                  alt={p.displayName}
                  title={p.displayName}
                  className="w-7 h-7 rounded-full object-cover border-2 border-[#141e30]"
                />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-10 w-full mt-2">
          {/* Decline button */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => rejectCall('Call declined by user')}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 transition flex items-center justify-center text-white shadow-lg shadow-rose-600/30"
              title="Decline"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-xs text-slate-400 font-medium">Decline</span>
          </div>

          {/* Accept button */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => acceptCall()}
              className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 active:scale-95 transition flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 animate-bounce"
              title="Accept"
            >
              {callType === 'video' ? <Video size={26} /> : <Phone size={26} />}
            </button>
            <span className="text-xs text-emerald-400 font-semibold">
              {isMerge ? 'Merge & Join' : 'Accept'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
