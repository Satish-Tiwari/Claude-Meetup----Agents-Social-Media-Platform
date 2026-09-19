import React, { useState } from 'react';
import { User, CallType } from '../../types';
import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext';
import { X, Users, Video, Phone, Check } from 'lucide-react';

interface GroupCallCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
}

export const GroupCallCreatorModal: React.FC<GroupCallCreatorModalProps> = ({
  isOpen,
  onClose,
  users,
}) => {
  const { startCall } = useCall();
  const { onlineUserIds } = useSocket();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [callType, setCallType] = useState<CallType>('video');
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((userId) => userId !== id) : [...prev, id],
    );
  };

  const handleStartGroupCall = async () => {
    if (selectedUserIds.length === 0) return;
    const targets = users.filter((u) => selectedUserIds.includes(u.id));
    await startCall(targets, callType, title.trim() || 'Group Conference');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="bg-[#141e30] border border-[#28395a] rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#28395a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Start Group Call</h3>
              <p className="text-xs text-slate-400">Select multiple contacts for conference</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Title Input */}
        <div className="pt-4 pb-2">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Conference Topic / Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Design Sync, Team Catchup"
            className="w-full px-3.5 py-2 bg-[#0a0f18] border border-[#28395a] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Call Type Toggle */}
        <div className="grid grid-cols-2 gap-2 my-2">
          <button
            type="button"
            onClick={() => setCallType('video')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
              callType === 'video'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-[#0a0f18] border-[#28395a] text-slate-400 hover:text-white'
            }`}
          >
            <Video size={16} />
            <span>Group Video</span>
          </button>
          <button
            type="button"
            onClick={() => setCallType('audio')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
              callType === 'audio'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-[#0a0f18] border-[#28395a] text-slate-400 hover:text-white'
            }`}
          >
            <Phone size={16} />
            <span>Group Voice</span>
          </button>
        </div>

        {/* User Selection list */}
        <label className="block text-xs font-semibold text-slate-300 mt-2 mb-1">
          Select Participants ({selectedUserIds.length})
        </label>
        <div className="overflow-y-auto flex-1 divide-y divide-[#28395a]/40 space-y-1 pr-1">
          {users.map((u) => {
            const isOnline = onlineUserIds.includes(u.id);
            const isSelected = selectedUserIds.includes(u.id);

            return (
              <div
                key={u.id}
                onClick={() => toggleUser(u.id)}
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
          })}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#28395a] flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            disabled={selectedUserIds.length === 0}
            onClick={handleStartGroupCall}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-sm font-semibold text-white transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
          >
            {callType === 'video' ? <Video size={16} /> : <Phone size={16} />}
            <span>Start ({selectedUserIds.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
