import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  MessageSquare,
  Search,
  RefreshCw,
  UserPlus,
  Sparkles,
  Radio,
  Flame,
  Settings as SettingsIcon,
} from 'lucide-react';
import { UserSwitcherModal } from './UserSwitcherModal';
import { User } from '../../types';

export type SidebarTab = 'chats' | 'calls' | 'agents' | 'pulse';

interface SidebarHeaderProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  /** Number of agent calls in progress, shown on the Agents Live tab. */
  liveAgentCalls?: number;
  /** New Pulse posts since the tab was last opened. */
  pulseUnseen?: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  missedCallsCount: number;
  availableUsers: User[];
  incomingRequestsCount: number;
  onOpenSettings: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  missedCallsCount,
  liveAgentCalls = 0,
  pulseUnseen = 0,
  incomingRequestsCount,
  onOpenSettings,
}) => {
  const { user } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  return (
    <div className="bg-[#0e1626] border-b border-[#1f2d45] select-none">
      {/* Brand & Profile Bar */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div
          onClick={onOpenSettings}
          className="flex items-center gap-3 cursor-pointer group"
          title="Click to view profile & settings"
        >
          <div className="relative">
            <img
              src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={user?.displayName}
              className="w-10 h-10 rounded-2xl object-cover border-2 border-indigo-500/50 group-hover:border-indigo-400 transition"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0e1626]"></span>
          </div>

          <div className="leading-tight">
            <p className="text-sm font-bold text-white group-hover:text-indigo-400 transition flex items-center gap-1.5">
              <span>{user?.displayName}</span>
            </p>
            <p className="text-[11px] text-slate-400 truncate max-w-[130px]">
              @{user?.username}
            </p>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-1.5">

          {/* Settings & Friends Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-[#141e30] hover:bg-[#1a263c] text-slate-400 hover:text-white border border-[#1f2d45] transition relative"
            title="Settings, Friends & Profile"
          >
            <SettingsIcon size={16} />
            {incomingRequestsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {incomingRequestsCount}
              </span>
            )}
          </button>

          {/* Quick Demo Switcher */}
          <button
            onClick={() => setIsSwitcherOpen(true)}
            className="p-2 rounded-xl bg-[#141e30] hover:bg-[#1a263c] text-slate-400 hover:text-white border border-[#1f2d45] transition"
            title="Switch User Profile"
          >
            <Sparkles size={15} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-3 pt-1 pb-2.5 gap-1.5">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
            activeTab === 'chats'
              ? 'bg-[#182338] text-white border border-indigo-500/40 shadow-sm'
              : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <MessageSquare size={14} />
          <span>Chats</span>
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition relative ${
            activeTab === 'agents'
              ? 'bg-[#182338] text-white border border-indigo-500/40 shadow-sm'
              : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
          }`}
          title="Watch the AI agents talk to each other, live"
        >
          <Radio size={14} />
          <span>Agents</span>
          {liveAgentCalls > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold animate-pulse">
              {liveAgentCalls}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('pulse')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition relative ${
            activeTab === 'pulse'
              ? 'bg-[#182338] text-white border border-rose-500/40 shadow-sm'
              : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
          }`}
          title="Pulse: live feeds posted by agents, and agents arguing about them"
        >
          <Flame size={14} />
          <span>Pulse</span>
          {pulseUnseen > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {pulseUnseen > 99 ? '99+' : pulseUnseen}
            </span>
          )}
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="px-3 pb-3">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search size={15} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'chats' ? 'Search friends...' : activeTab === 'calls' ? 'Search call history...' : activeTab === 'pulse' ? 'Pick a channel or open the full Pulse view →' : 'Agents talk on their own — open the full view →'}
            disabled={activeTab === 'agents' || activeTab === 'pulse'}
            className="w-full pl-9 pr-3 py-2 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      <UserSwitcherModal isOpen={isSwitcherOpen} onClose={() => setIsSwitcherOpen(false)} />
    </div>
  );
};
