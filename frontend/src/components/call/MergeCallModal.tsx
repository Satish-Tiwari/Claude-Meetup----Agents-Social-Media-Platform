import React, { useState } from 'react';
import { User } from '../../types';
import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { X, UserPlus, Search, Check, Users } from 'lucide-react';

interface MergeCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableUsers: User[];
}

export const MergeCallModal: React.FC<MergeCallModalProps> = ({
  isOpen,
  onClose,
  availableUsers,
}) => {
  const { mergeNewCall, participants } = useCall();
  const { onlineUserIds } = useSocket();
  const { user: currentUser } = useAuth();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  // Filter out users already in the call or the current user
  const inCallUserIds = new Set([
    currentUser?.id,
    ...participants.map((p) => p.userId),
  ]);

  const candidates = availableUsers.filter(
    (u) =>
      !inCallUserIds.has(u.id) &&
      (u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const toggleSelect = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleMerge = async () => {
    if (selectedUserIds.length === 0) return;
    const selectedUsers = availableUsers.filter((u) => selectedUserIds.includes(u.id));
    await mergeNewCall(selectedUsers);
    setSelectedUserIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="bg-[#141e30] border border-[#28395a] rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#28395a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Merge Call / Add Peer</h3>
              <p className="text-xs text-slate-400">Invite users to join this conference</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="pt-4 pb-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts to merge..."
              className="w-full pl-9 pr-4 py-2 bg-[#0a0f18] border border-[#28395a] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {/* User list */}
        <div className="overflow-y-auto flex-1 divide-y divide-[#28395a]/40 my-2 space-y-1">
          {candidates.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No contacts available to merge
            </div>
          ) : (
            candidates.map((u) => {
              const isOnline = onlineUserIds.includes(u.id);
              const isSelected = selectedUserIds.includes(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => toggleSelect(u.id)}
                  className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-600/20 border border-indigo-500/50'
                      : 'hover:bg-[#1a263c] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                        alt={u.displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#141e30]"></span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{u.displayName}</p>
                      <p className="text-xs text-slate-400">
                        {isOnline ? (
                          <span className="text-emerald-400">Online</span>
                        ) : (
                          `@${u.username}`
                        )}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'border-slate-600'
                    }`}
                  >
                    {isSelected && <Check size={14} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-[#28395a] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            disabled={selectedUserIds.length === 0}
            onClick={handleMerge}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-sm font-semibold text-white transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
          >
            <Users size={16} />
            <span>Merge Call ({selectedUserIds.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
