import React from 'react';
import { User, CallType } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { useCall } from '../../context/CallContext';
import { Phone, Video, UserPlus } from 'lucide-react';

interface ChatListProps {
  users: User[];
  selectedUser: User | null;
  onSelectUser: (user: User) => void;
  onOpenSettings?: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  users,
  selectedUser,
  onSelectUser,
  onOpenSettings,
}) => {
  const { onlineUserIds } = useSocket();
  const { startCall } = useCall();

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center my-auto">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
          <UserPlus size={22} />
        </div>
        <p className="text-sm font-bold text-white mb-1">No Friends Connected</p>
        <p className="text-xs text-slate-400 mb-4 max-w-[220px]">
          Search users and send a friend request to unlock real-time chats and calls
        </p>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
          >
            <UserPlus size={14} />
            <span>Find & Add Friends</span>
          </button>
        )}
      </div>
    );
  }

  const handleCall = (e: React.MouseEvent, user: User, type: CallType) => {
    e.stopPropagation();
    startCall(user, type);
  };

  return (
    <div className="overflow-y-auto flex-1 divide-y divide-[#1f2d45]/40 p-2 space-y-1">
      {users.map((u) => {
        const isOnline = onlineUserIds.includes(u.id);
        const isSelected = selectedUser?.id === u.id;

        return (
          <div
            key={u.id}
            onClick={() => onSelectUser(u)}
            className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition group border ${
              isSelected
                ? 'bg-[#182338] border-indigo-500/40 shadow-sm'
                : 'hover:bg-[#121a2a] border-transparent'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar */}
              <div className="relative shrink-0">
                <img
                  src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt={u.displayName}
                  className="w-12 h-12 rounded-2xl object-cover"
                />
                {isOnline && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0e1626]"></span>
                )}
              </div>

              {/* User details */}
              <div className="min-w-0 text-left">
                <h4 className="text-sm font-semibold text-slate-100 truncate">
                  {u.displayName}
                </h4>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {isOnline ? (
                    <span className="text-cyan-400 font-medium">Online</span>
                  ) : (
                    u.statusMessage || `@${u.username}`
                  )}
                </p>
              </div>
            </div>

            {/* Quick Call Actions */}
            <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition pl-2">
              <button
                onClick={(e) => handleCall(e, u, 'audio')}
                className="p-2 rounded-xl bg-[#141e30] hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-300 transition"
                title="Voice Call"
              >
                <Phone size={15} />
              </button>
              <button
                onClick={(e) => handleCall(e, u, 'video')}
                className="p-2 rounded-xl bg-[#141e30] hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-300 transition"
                title="Video Call"
              >
                <Video size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
