import React from 'react';
import { useCall } from '../../context/CallContext';
import { Phone, PhoneOff, Pause, Video, X } from 'lucide-react';

export const CallWaitingBanner: React.FC = () => {
  const {
    callStatus,
    incomingCall,
    holdAndAcceptNewCall,
    endCurrentAndAcceptNewCall,
    rejectCall,
  } = useCall();

  if (callStatus !== 'connected' || !incomingCall) {
    return null;
  }

  const { callerInfo, callType, title, isGroup } = incomingCall;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 animate-slide-up select-none">
      <div className="bg-[#121a2a]/95 backdrop-blur-xl border-2 border-indigo-500/60 rounded-3xl p-4 shadow-2xl shadow-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Caller Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={callerInfo.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={callerInfo.displayName}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500 animate-pulse-ring"
            />
            <span className="absolute -bottom-1 -right-1 p-1 bg-indigo-600 rounded-full text-white text-[10px]">
              {callType === 'video' ? <Video size={12} /> : <Phone size={12} />}
            </span>
          </div>

          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-[10px] tracking-wider uppercase">
                Call Waiting
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {isGroup ? 'Group Call' : `${callType === 'video' ? 'Video' : 'Voice'} Call`}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white leading-tight mt-0.5">
              {callerInfo.displayName}
            </h4>
            <p className="text-[11px] text-slate-400">
              {title || `@${callerInfo.username}`}
            </p>
          </div>
        </div>

        {/* 3 Call Waiting Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Decline new call */}
          <button
            onClick={() => rejectCall('Busy on another call')}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 transition border border-slate-700/50"
            title="Decline new call"
          >
            <X size={18} />
          </button>

          {/* End Current & Answer */}
          <button
            onClick={endCurrentAndAcceptNewCall}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            title="End active call and answer this new call"
          >
            <PhoneOff size={14} className="text-rose-400" />
            <span className="hidden md:inline">End & Answer</span>
          </button>

          {/* Hold Current & Answer */}
          <button
            onClick={holdAndAcceptNewCall}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 active:scale-95"
            title="Hold current call and answer new call"
          >
            <Pause size={14} />
            <span>Hold & Answer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
