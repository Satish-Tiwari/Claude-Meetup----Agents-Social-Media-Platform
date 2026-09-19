import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, Check, LogOut, Info, Shield } from 'lucide-react';

interface UserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSwitcherModal: React.FC<UserSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { user, quickSwitch, logout } = useAuth();

  if (!isOpen) return null;

  const accounts = [
    {
      username: 'alice',
      displayName: 'Alice Johnson',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      note: 'Video & Audio Ready',
    },
    {
      username: 'bob',
      displayName: 'Bob Smith',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      note: 'Mobile / Laptop Ready',
    },
    {
      username: 'charlie',
      displayName: 'Charlie Brown',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
      note: 'Group Conference Ready',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="bg-[#141e30] border border-[#28395a] rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-[#28395a] mb-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-indigo-400" />
            <h2 className="text-base font-bold text-white">Active Session & Switcher</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-[#0a0f18] rounded-2xl border border-indigo-500/20 text-xs text-slate-400 flex items-start gap-2.5">
          <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Group Call Tip:</strong> Open 2 or 3 tabs (e.g. <strong>Alice</strong>, <strong>Bob</strong>, and <strong>Charlie</strong>) to test 3-way multi-party group calls and real-time call merging!
          </span>
        </div>

        <div className="space-y-2 mb-6">
          {accounts.map((acc) => {
            const isCurrent = user?.username === acc.username;
            return (
              <button
                key={acc.username}
                onClick={async () => {
                  if (!isCurrent) {
                    await quickSwitch(acc.username);
                    onClose();
                  }
                }}
                className={`w-full p-3 rounded-2xl flex items-center justify-between transition border ${
                  isCurrent
                    ? 'bg-indigo-600/15 border-indigo-500/60 text-white shadow-md'
                    : 'bg-[#0a0f18] hover:bg-[#1a263c] border-transparent text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={acc.avatar}
                    alt={acc.displayName}
                    className="w-10 h-10 rounded-full object-cover border border-[#28395a]"
                  />
                  <div className="text-left">
                    <p className="text-sm font-semibold">{acc.displayName}</p>
                    <p className="text-xs text-slate-400">@{acc.username} • {acc.note}</p>
                  </div>
                </div>

                {isCurrent && (
                  <span className="p-1.5 rounded-full bg-indigo-600 text-white">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            logout();
            onClose();
          }}
          className="w-full py-2.5 px-4 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 border border-rose-500/20"
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};
