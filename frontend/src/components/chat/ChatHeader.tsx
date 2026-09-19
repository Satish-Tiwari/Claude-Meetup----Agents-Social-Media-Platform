import React, { useState, useRef, useEffect } from 'react';
import { User, CallType } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { useCall } from '../../context/CallContext';
import { Phone, Video, MoreVertical, ArrowLeft, Trash2 } from 'lucide-react';

interface ChatHeaderProps {
  user: User;
  onBack: () => void;
  onClearChat?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ user, onBack, onClearChat }) => {
  const { onlineUserIds } = useSocket();
  const { startCall } = useCall();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOnline = onlineUserIds.includes(user.id);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCall = (type: CallType) => {
    startCall(user, type);
  };

  const handleClear = () => {
    setIsMenuOpen(false);
    if (window.confirm(`Clear chat with ${user.displayName}? All messages in this conversation will be deleted.`)) {
      onClearChat?.();
    }
  };

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-[#0e1626] border-b border-[#1f2d45] select-none shrink-0 relative">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 rounded-xl text-slate-400 hover:text-white"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="relative">
          <img
            src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
            alt={user.displayName}
            className="w-10 h-10 rounded-2xl object-cover border border-indigo-500/40"
          />
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0e1626]"></span>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-white leading-tight">
            {user.displayName}
          </h3>
          <p className="text-xs text-slate-400">
            {isOnline ? (
              <span className="text-cyan-400 font-medium">Online</span>
            ) : (
              user.statusMessage || `@${user.username}`
            )}
          </p>
        </div>
      </div>

      {/* Call & Menu Buttons */}
      <div className="flex items-center gap-2 text-slate-300 relative" ref={menuRef}>
        <button
          onClick={() => handleCall('audio')}
          className="p-2.5 rounded-xl bg-[#141e30] hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-400 border border-[#1f2d45] transition"
          title="Direct Voice Call"
        >
          <Phone size={17} />
        </button>

        <button
          onClick={() => handleCall('video')}
          className="p-2.5 rounded-xl bg-[#141e30] hover:bg-cyan-600/20 text-slate-300 hover:text-cyan-400 border border-[#1f2d45] transition"
          title="Direct Video Call"
        >
          <Video size={17} />
        </button>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2.5 rounded-xl bg-[#141e30] hover:bg-[#1a263c] text-slate-400 hover:text-white border border-[#1f2d45] transition"
          title="Chat Options"
        >
          <MoreVertical size={17} />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-12 z-30 w-44 bg-[#0e1626] border border-[#1f2d45] rounded-2xl shadow-2xl py-1.5 animate-fade-in">
            <button
              onClick={handleClear}
              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-400 hover:bg-rose-500/15 flex items-center gap-2 transition"
            >
              <Trash2 size={14} />
              <span>Clear Chat</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
