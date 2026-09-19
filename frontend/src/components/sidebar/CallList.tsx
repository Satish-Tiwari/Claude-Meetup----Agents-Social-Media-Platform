import React from 'react';
import { CallRecord, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Phone,
  Users,
  Trash2,
} from 'lucide-react';

interface CallListProps {
  calls: CallRecord[];
  onSelectUser: (user: User) => void;
  onDeleteCall?: (callId: string) => void;
  onClearAllCalls?: () => void;
}

export const CallList: React.FC<CallListProps> = ({
  calls,
  onSelectUser,
  onDeleteCall,
  onClearAllCalls,
}) => {
  const { user } = useAuth();
  const { startCall } = useCall();

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
        <Phone size={36} className="mb-2 opacity-30 text-indigo-400" />
        <p className="text-sm font-semibold">No recent call records</p>
        <p className="text-xs mt-1 text-slate-400">Audio, video and group conference logs will appear here.</p>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="overflow-y-auto flex-1 p-2 space-y-1">
      {/* Call History Header Bar with Clear All */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#1f2d45]/30 mb-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Calls ({calls.length})
        </span>
        {onClearAllCalls && calls.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear all call logs? This will delete your entire call history.')) {
                onClearAllCalls();
              }
            }}
            className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 px-2 py-1 hover:bg-rose-500/10 rounded-lg transition"
            title="Clear all call history"
          >
            <Trash2 size={12} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-[#1f2d45]/40 space-y-1">
        {calls.map((c) => {
          const isOutgoing = c.callerId === user?.id;
          const otherUser = isOutgoing ? c.callee : c.caller;
          const isMissed = c.status === 'missed' || c.status === 'rejected';

          return (
            <div
              key={c.id}
              onClick={() => otherUser && onSelectUser(otherUser)}
              className="flex items-center justify-between p-3 rounded-2xl cursor-pointer hover:bg-[#121a2a] transition group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <img
                    src={otherUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={otherUser?.displayName}
                    className="w-11 h-11 rounded-2xl object-cover shrink-0"
                  />
                  {c.isGroup && (
                    <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1 rounded-full text-[10px]">
                      <Users size={10} />
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`text-sm font-semibold truncate ${
                        isMissed && !isOutgoing ? 'text-rose-400' : 'text-slate-100'
                      }`}
                    >
                      {c.groupTitle || otherUser?.displayName || 'Conference Call'}
                    </h4>
                    {c.isGroup && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                        Group
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    {isOutgoing ? (
                      <PhoneOutgoing size={13} className="text-cyan-400" />
                    ) : isMissed ? (
                      <PhoneMissed size={13} className="text-rose-400" />
                    ) : (
                      <PhoneIncoming size={13} className="text-emerald-400" />
                    )}

                    <span>{formatDate(c.createdAt)}</span>
                    {c.duration > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-300">{formatDuration(c.duration)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Call Actions */}
              <div className="flex items-center gap-1.5 pl-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (otherUser) {
                      startCall(otherUser, c.callType);
                    }
                  }}
                  className="p-2 rounded-xl bg-[#141e30] hover:bg-indigo-600/20 text-indigo-300 transition"
                  title={`Call back with ${c.callType}`}
                >
                  {c.callType === 'video' ? <Video size={16} /> : <Phone size={16} />}
                </button>

                {onDeleteCall && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this call log entry?')) {
                        onDeleteCall(c.id);
                      }
                    }}
                    className="p-2 rounded-xl bg-[#141e30] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 opacity-80 sm:opacity-0 group-hover:opacity-100 transition"
                    title="Delete call log"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
