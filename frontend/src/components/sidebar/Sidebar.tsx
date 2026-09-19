import React, { useState } from 'react';
import { User, CallRecord } from '../../types';
import { SidebarHeader, SidebarTab } from './SidebarHeader';
import { AgentsLiveList } from '../../observatory/AgentsLiveList';
import { ObservatoryData } from '../../observatory/useObservatory';
import { PulseChannelList } from '../../pulse/PulseChannelList';
import { PulseData } from '../../pulse/usePulse';
import { ChatList } from './ChatList';
import { CallList } from './CallList';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  friends: User[];
  calls: CallRecord[];
  selectedUser: User | null;
  onSelectUser: (user: User) => void;
  onSelectUserFromCall: (user: User) => void;
  incomingRequestsCount: number;
  onOpenSettings: () => void;
  onDeleteCall?: (callId: string) => void;
  onClearAllCalls?: () => void;
  /** Live agent data shared with the main area, so the app holds one observer socket. */
  observatory: ObservatoryData;
  agentsLiveOpen: boolean;
  onOpenAgentsLive: () => void;
  pulse: PulseData;
  pulseOpen: boolean;
  onOpenPulse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  friends,
  calls,
  selectedUser,
  onSelectUser,
  onSelectUserFromCall,
  incomingRequestsCount,
  onOpenSettings,
  onDeleteCall,
  onClearAllCalls,
  observatory,
  agentsLiveOpen,
  onOpenAgentsLive,
  pulse,
  pulseOpen,
  onOpenPulse,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');

  const liveAgentCalls = (observatory.snapshot?.activeRooms ?? []).filter((r) =>
    r.participants.some((p) => p.isAgent),
  ).length;
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out current user
  const otherFriends = friends.filter((u) => u.id !== user?.id);

  // Filter friends by search query
  const filteredFriends = otherFriends.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter calls by search query
  const filteredCalls = calls.filter((c) => {
    const isOutgoing = c.callerId === user?.id;
    const other = isOutgoing ? c.callee : c.caller;
    return (
      c.groupTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      other?.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      other?.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const missedCallsCount = calls.filter(
    (c) => c.calleeId === user?.id && (c.status === 'missed' || c.status === 'rejected'),
  ).length;

  return (
    <div className="w-full md:w-[380px] lg:w-[410px] flex flex-col h-full bg-[#0a0f18] border-r border-[#1f2d45] shrink-0">
      <SidebarHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        missedCallsCount={missedCallsCount}
        liveAgentCalls={liveAgentCalls}
        pulseUnseen={pulse.unseen}
        availableUsers={otherFriends}
        incomingRequestsCount={incomingRequestsCount}
        onOpenSettings={onOpenSettings}
      />

      {activeTab === 'chats' ? (
        <ChatList
          users={filteredFriends}
          selectedUser={selectedUser}
          onSelectUser={onSelectUser}
          onOpenSettings={onOpenSettings}
        />
      ) : activeTab === 'agents' ? (
        <AgentsLiveList data={observatory} onOpen={onOpenAgentsLive} isOpen={agentsLiveOpen} />
      ) : activeTab === 'pulse' ? (
        <PulseChannelList data={pulse} onOpen={onOpenPulse} isOpen={pulseOpen} />
      ) : (
        <CallList
          calls={filteredCalls}
          onSelectUser={onSelectUserFromCall}
          onDeleteCall={onDeleteCall}
          onClearAllCalls={onClearAllCalls}
        />
      )}
    </div>
  );
};
