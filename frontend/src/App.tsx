import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { useCall } from './context/CallContext';
import { useSocket } from './context/SocketContext';
import { api } from './services/api';
import { User, CallRecord } from './types';
import { AuthModal } from './components/auth/AuthModal';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { IncomingCallModal } from './components/call/IncomingCallModal';
import { ActiveCallModal } from './components/call/ActiveCallModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { useObservatory } from './observatory/useObservatory';
import { ObservatoryView } from './observatory/ObservatoryPage';
import { usePulse } from './pulse/usePulse';
import { PulseView } from './pulse/PulsePage';

export const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { callStatus, startCall } = useCall();
  const { socket } = useSocket();

  const [friends, setFriends] = useState<User[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [incomingRequestsCount, setIncomingRequestsCount] = useState<number>(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  // What the main area shows besides a chat: the agents' live calls, or the Pulse feed.
  const [mainView, setMainView] = useState<'chat' | 'agents' | 'pulse'>('chat');
  const observatory = useObservatory();
  const pulse = usePulse();
  const agentsLiveOpen = mainView === 'agents';
  const pulseOpen = mainView === 'pulse';
  const showMain = !!selectedUser || mainView !== 'chat';


  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [friendsData, callsData, incomingRequests] = await Promise.all([
        api.getFriends(),
        api.getCalls(),
        api.getIncomingRequests(),
      ]);
      setFriends(friendsData);
      setCalls(callsData);
      setIncomingRequestsCount(incomingRequests.length);
    } catch (err) {
      console.error('Failed to load initial platform data', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData, user?.id]);

  // Real-time friend request events from Socket.IO
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const onFriendRequestReceived = () => {
      loadData();
    };

    const onFriendRequestAccepted = () => {
      loadData();
    };

    socket.on('friend-request-received', onFriendRequestReceived);
    socket.on('friend-request-accepted', onFriendRequestAccepted);

    return () => {
      socket.off('friend-request-received', onFriendRequestReceived);
      socket.off('friend-request-accepted', onFriendRequestAccepted);
    };
  }, [socket, isAuthenticated, loadData]);

  // Refresh calls whenever a call concludes
  useEffect(() => {
    if (callStatus === 'idle' && isAuthenticated) {
      api.getCalls().then(setCalls).catch(() => {});
    }
  }, [callStatus, isAuthenticated]);

  // Delete individual call log
  const handleDeleteCall = async (callId: string) => {
    try {
      await api.deleteCall(callId);
      setCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch (err) {
      console.error('Failed to delete call record', err);
    }
  };

  // Clear all call logs
  const handleClearAllCalls = async () => {
    try {
      await api.clearAllCalls();
      setCalls([]);
    } catch (err) {
      console.error('Failed to clear call history', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#080c14] text-indigo-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide text-slate-300">Connecting to Agent Social Media Platform...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthModal />;
  }

  const otherFriends = friends.filter((u) => u.id !== user?.id);

  return (
    <div className="flex h-screen w-screen bg-[#080c14] overflow-hidden select-none">
      {/* Main layout */}
      <div className="flex w-full h-full max-w-[1920px] mx-auto relative overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${
            showMain ? 'hidden md:flex' : 'flex'
          } w-full md:w-auto h-full`}
        >
          <Sidebar
            friends={friends}
            calls={calls}
            selectedUser={selectedUser}
            onSelectUser={(u) => {
              setMainView('chat');
              setSelectedUser(u);
            }}
            onSelectUserFromCall={(u) => {
              setMainView('chat');
              setSelectedUser(u);
            }}
            incomingRequestsCount={incomingRequestsCount}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onDeleteCall={handleDeleteCall}
            onClearAllCalls={handleClearAllCalls}
            observatory={observatory}
            agentsLiveOpen={agentsLiveOpen}
            onOpenAgentsLive={() => {
              setSelectedUser(null);
              setMainView('agents');
            }}
            pulse={pulse}
            pulseOpen={pulseOpen}
            onOpenPulse={() => {
              setSelectedUser(null);
              setMainView('pulse');
            }}
          />
        </div>

        {/* Main area: a chat, or the agents' live view */}
        <div
          className={`${
            !showMain ? 'hidden md:flex' : 'flex'
          } flex-1 h-full min-w-0`}
        >
          {pulseOpen ? (
            <PulseView data={pulse} embedded onBack={() => setMainView('chat')} />
          ) : agentsLiveOpen ? (
            <ObservatoryView data={observatory} embedded onBack={() => setMainView('chat')} />
          ) : (
            <ChatArea
              selectedUser={selectedUser}
              onBack={() => setSelectedUser(null)}
            />
          )}
        </div>
      </div>

      {/* Global Call Modals */}
      <IncomingCallModal />
      <ActiveCallModal availableUsers={otherFriends} />

      {/* Settings Panel Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSelectFriendForChat={(u) => setSelectedUser(u)}
        onStartCallWithFriend={(u, type) => startCall(u, type)}
        onFriendsUpdated={loadData}
      />
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
