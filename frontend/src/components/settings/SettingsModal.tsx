import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { User, Friendship, FriendSearchResult } from '../../types';
import {
  X,
  User as UserIcon,
  Users,
  Sun,
  Moon,
  Shield,
  Search,
  UserPlus,
  Check,
  Clock,
  Trash2,
  Phone,
  Video,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Mail,
  Edit3,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFriendForChat?: (user: User) => void;
  onStartCallWithFriend?: (user: User, type: 'audio' | 'video') => void;
  onFriendsUpdated?: () => void;
}

type SettingsTab = 'profile' | 'friends' | 'appearance' | 'security';
type FriendsSubTab = 'add' | 'incoming' | 'outgoing' | 'my-friends';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSelectFriendForChat,
  onStartCallWithFriend,
  onFriendsUpdated,
}) => {
  const { user, updateUser, updateTheme } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('add');

  // Profile Form State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');

  // Friends Data State
  const [friends, setFriends] = useState<User[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Friendship[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Appearance State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('calling_theme') !== 'light';
  });

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status/Alert State
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setStatusMessage(user.statusMessage || '');
      setAvatar(user.avatar || '');
      setIsDarkMode(user.theme !== 'light');
    }
  }, [user]);

  // Load Friends & Requests when opening modal or changing to friends tab
  const loadFriendsData = async () => {
    try {
      const [friendsList, incoming, outgoing] = await Promise.all([
        api.getFriends(),
        api.getIncomingRequests(),
        api.getOutgoingRequests(),
      ]);
      setFriends(friendsList);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      console.warn('Failed to load friends data', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFriendsData();
      setStatusFeedback(null);
    }
  }, [isOpen]);

  // Live Search Users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchUsers(searchQuery.trim());
        setSearchResults(results);
      } catch (err) {
        console.warn('Failed to search users', err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  // PROFILE TAB SUBMIT
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusFeedback(null);
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        statusMessage: statusMessage.trim(),
        avatar: avatar.trim(),
      });
      updateUser(updated);
      setStatusFeedback({ type: 'success', message: 'Profile updated successfully!' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  // SEND FRIEND REQUEST
  const handleSendRequest = async (targetUserId: string) => {
    try {
      await api.sendFriendRequest({ targetUserId });
      setSearchResults((prev) =>
        prev.map((r) => (r.user.id === targetUserId ? { ...r, relationship: 'pending_sent' } : r))
      );
      loadFriendsData();
      onFriendsUpdated?.();
      setStatusFeedback({ type: 'success', message: 'Friend request sent!' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to send request' });
    }
  };

  // ACCEPT FRIEND REQUEST
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptFriendRequest(requestId);
      loadFriendsData();
      onFriendsUpdated?.();
      setStatusFeedback({ type: 'success', message: 'Friend request accepted!' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to accept request' });
    }
  };

  // REJECT FRIEND REQUEST
  const handleRejectRequest = async (requestId: string) => {
    try {
      await api.rejectFriendRequest(requestId);
      loadFriendsData();
      onFriendsUpdated?.();
      setStatusFeedback({ type: 'success', message: 'Friend request declined' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to decline request' });
    }
  };

  // CANCEL OUTGOING REQUEST
  const handleCancelRequest = async (requestId: string) => {
    try {
      await api.cancelFriendRequest(requestId);
      loadFriendsData();
      onFriendsUpdated?.();
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to cancel request' });
    }
  };

  // REMOVE FRIEND
  const handleRemoveFriend = async (friendId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from your friends?`)) return;
    try {
      await api.removeFriend(friendId);
      loadFriendsData();
      onFriendsUpdated?.();
      setStatusFeedback({ type: 'success', message: `${name} removed from friends` });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to remove friend' });
    }
  };

  // THEME TOGGLE
  const toggleTheme = async (dark: boolean) => {
    setIsDarkMode(dark);
    const chosenTheme = dark ? 'dark' : 'light';
    await updateTheme(chosenTheme);
    setStatusFeedback({
      type: 'success',
      message: `Theme updated to ${dark ? 'Dark Obsidian' : 'Modern Light'} and saved to your account!`,
    });
  };

  // PASSWORD CHANGE SUBMIT
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setStatusFeedback({ type: 'error', message: 'Please provide all password fields' });
      return;
    }
    if (newPassword.length < 6) {
      setStatusFeedback({ type: 'error', message: 'New password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusFeedback({ type: 'error', message: 'New passwords do not match' });
      return;
    }

    setLoading(true);
    setStatusFeedback(null);
    try {
      const res = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatusFeedback({ type: 'success', message: res.message || 'Password changed successfully!' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b12]/85 backdrop-blur-md p-4 select-none animate-fade-in">
      <div className="bg-[#121a2a] border border-[#1f2d45] rounded-3xl w-full max-w-2xl h-[620px] shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2d45] bg-[#0d1422]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Edit3 size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Platform Settings</h2>
              <p className="text-[11px] text-slate-400">Manage profile, friends, appearance and account security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-[#1f2d45] bg-[#0a0f18] gap-2 overflow-x-auto py-2">
          <button
            onClick={() => {
              setActiveTab('profile');
              setStatusFeedback(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#141e30]'
            }`}
          >
            <UserIcon size={14} />
            <span>Profile</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('friends');
              setStatusFeedback(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition relative ${
              activeTab === 'friends'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#141e30]'
            }`}
          >
            <Users size={14} />
            <span>Friends & Requests</span>
            {incomingRequests.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('appearance');
              setStatusFeedback(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'appearance'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#141e30]'
            }`}
          >
            <Sun size={14} />
            <span>Appearance</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('security');
              setStatusFeedback(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#141e30]'
            }`}
          >
            <Shield size={14} />
            <span>Security</span>
          </button>
        </div>

        {/* Global Feedback Alert */}
        {statusFeedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2 animate-fade-in ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            {statusFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusFeedback.message}</span>
          </div>
        )}

        {/* Tab Content Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <img
                    src={avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={displayName}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-500 shadow-xl"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Avatar & Identity</h3>
                  <p className="text-xs text-slate-400 mb-2">Select a preset avatar or paste an image link</p>
                  <div className="flex items-center gap-2">
                    {PRESET_AVATARS.map((pUrl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setAvatar(pUrl)}
                        className={`w-7 h-7 rounded-lg overflow-hidden border transition ${
                          avatar === pUrl ? 'border-cyan-400 scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={pUrl} alt="Preset" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Avatar Image URL</label>
                <input
                  type="text"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Status Note</label>
                <input
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  placeholder="Available for video calls 📹"
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="p-3.5 bg-[#0a0f18] rounded-xl border border-[#1f2d45] flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-300">Registered Email</p>
                  <p className="text-[11px] text-slate-400">{user?.email || 'demo-account@callingplatform.com'}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>Verified</span>
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
              >
                <span>{loading ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>
            </form>
          )}

          {/* TAB 2: FRIENDS & REQUESTS */}
          {activeTab === 'friends' && (
            <div>
              {/* Friends Sub Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-[#0a0f18] rounded-xl border border-[#1f2d45] mb-4">
                <button
                  type="button"
                  onClick={() => setFriendsSubTab('add')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    friendsSubTab === 'add'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus size={13} />
                  <span>Add Friends</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFriendsSubTab('incoming')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    friendsSubTab === 'incoming'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Clock size={13} />
                  <span>Requests ({incomingRequests.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFriendsSubTab('outgoing')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    friendsSubTab === 'outgoing'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Sent ({outgoingRequests.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFriendsSubTab('my-friends')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    friendsSubTab === 'my-friends'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users size={13} />
                  <span>Friends ({friends.length})</span>
                </button>
              </div>

              {/* SUB-TAB A: ADD FRIENDS (SEARCH) */}
              {friendsSubTab === 'add' && (
                <div>
                  <div className="relative mb-4">
                    <Search size={15} className="absolute inset-y-0 left-3 my-auto text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users by username, email, or display name..."
                      className="w-full pl-9 pr-4 py-2 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  {searching ? (
                    <div className="p-8 text-center text-xs text-slate-400">Searching directory...</div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {searchResults.map((res) => (
                        <div
                          key={res.user.id}
                          className="flex items-center justify-between p-3 bg-[#0d1422] rounded-xl border border-[#1f2d45]"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={res.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={res.user.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-indigo-500/40"
                            />
                            <div>
                              <p className="text-xs font-bold text-white">{res.user.displayName}</p>
                              <p className="text-[11px] text-slate-400">@{res.user.username}</p>
                            </div>
                          </div>

                          <div>
                            {res.relationship === 'friends' ? (
                              <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1">
                                <Check size={12} />
                                <span>Friends</span>
                              </span>
                            ) : res.relationship === 'pending_sent' ? (
                              <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center gap-1">
                                <Clock size={12} />
                                <span>Pending</span>
                              </span>
                            ) : res.relationship === 'pending_received' ? (
                              <button
                                onClick={() => res.requestId && handleAcceptRequest(res.requestId)}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                              >
                                Accept Request
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSendRequest(res.user.id)}
                                className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow"
                              >
                                <UserPlus size={12} />
                                <span>Add Friend</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchQuery.trim() ? (
                    <div className="p-8 text-center text-xs text-slate-400">No users found matching "{searchQuery}"</div>
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-[#0a0f18] border border-[#1f2d45] text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                        <Search size={20} />
                      </div>
                      <p className="text-xs text-slate-300 font-semibold">Search for users to send a friend request</p>
                      <p className="text-[11px] text-slate-500 mt-1">Once they accept, you can start real-time chats, audio, and video calls</p>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB B: INCOMING REQUESTS */}
              {friendsSubTab === 'incoming' && (
                <div>
                  {incomingRequests.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No incoming friend requests at the moment.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {incomingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between p-3 bg-[#0d1422] rounded-xl border border-[#1f2d45]"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={req.sender?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={req.sender?.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-indigo-500/40"
                            />
                            <div>
                              <p className="text-xs font-bold text-white">{req.sender?.displayName}</p>
                              <p className="text-[11px] text-slate-400">@{req.sender?.username}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleAcceptRequest(req.id)}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                            >
                              <Check size={12} />
                              <span>Accept</span>
                            </button>
                            <button
                              onClick={() => handleRejectRequest(req.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB C: OUTGOING REQUESTS */}
              {friendsSubTab === 'outgoing' && (
                <div>
                  {outgoingRequests.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No pending outgoing friend requests.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {outgoingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between p-3 bg-[#0d1422] rounded-xl border border-[#1f2d45]"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={req.receiver?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={req.receiver?.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-indigo-500/40"
                            />
                            <div>
                              <p className="text-xs font-bold text-white">{req.receiver?.displayName}</p>
                              <p className="text-[11px] text-slate-400">@{req.receiver?.username}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleCancelRequest(req.id)}
                            className="px-3 py-1 bg-slate-800 hover:bg-rose-900/40 hover:text-rose-400 text-slate-300 rounded-lg text-xs font-medium transition"
                          >
                            Cancel Request
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB D: MY FRIENDS */}
              {friendsSubTab === 'my-friends' && (
                <div>
                  {friends.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      You haven't added any friends yet. Use the "Add Friends" tab to search!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {friends.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-3 bg-[#0d1422] rounded-xl border border-[#1f2d45]"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={f.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={f.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-indigo-500/40"
                            />
                            <div>
                              <p className="text-xs font-bold text-white">{f.displayName}</p>
                              <p className="text-[11px] text-slate-400">@{f.username}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {onSelectFriendForChat && (
                              <button
                                onClick={() => {
                                  onSelectFriendForChat(f);
                                  onClose();
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 transition"
                                title="Open Chat"
                              >
                                <MessageSquare size={14} />
                              </button>
                            )}

                            {onStartCallWithFriend && (
                              <>
                                <button
                                  onClick={() => {
                                    onStartCallWithFriend(f, 'audio');
                                    onClose();
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition"
                                  title="Voice Call"
                                >
                                  <Phone size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    onStartCallWithFriend(f, 'video');
                                    onClose();
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition"
                                  title="Video Call"
                                >
                                  <Video size={14} />
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => handleRemoveFriend(f.id, f.displayName)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition"
                              title="Unfriend"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: APPEARANCE (DARK / LIGHT THEME) */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white mb-1">Color Theme</h3>
              <p className="text-xs text-slate-400 mb-4">Choose your preferred visual aesthetic for the platform</p>

              <div className="grid grid-cols-2 gap-4">
                {/* Dark Theme Card */}
                <div
                  onClick={() => toggleTheme(true)}
                  className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col items-center text-center group ${
                    isDarkMode
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                      : 'border-[#1f2d45] bg-[#0a0f18] opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-[#080c14] border border-[#233554] text-indigo-400 flex items-center justify-center mb-3">
                    <Moon size={22} />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Dark Obsidian</h4>
                  <p className="text-[10px] text-slate-400">Deep obsidian with electric indigo & cyan accents</p>
                  {isDarkMode && (
                    <span className="mt-2.5 px-2.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                      Active Theme
                    </span>
                  )}
                </div>

                {/* Light Theme Card */}
                <div
                  onClick={() => toggleTheme(false)}
                  className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col items-center text-center group ${
                    !isDarkMode
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                      : 'border-[#1f2d45] bg-[#0a0f18] opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-200 border border-slate-300 text-amber-500 flex items-center justify-center mb-3">
                    <Sun size={22} />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Modern Light</h4>
                  <p className="text-[10px] text-slate-400">Clean slate and soft daylight indigo contrast</p>
                  {!isDarkMode && (
                    <span className="mt-2.5 px-2.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                      Active Theme
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY (PASSWORD CHANGE) */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <h3 className="text-sm font-bold text-white mb-1">Update Account Password</h3>
              <p className="text-xs text-slate-400 mb-4">Ensure your account is protected with a secure password</p>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
              >
                <span>{loading ? 'Updating...' : 'Save New Password'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
