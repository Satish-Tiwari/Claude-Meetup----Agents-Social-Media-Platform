import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, User as UserIcon, LogIn, Sparkles, Video, Phone } from 'lucide-react';

interface LoginModalProps {
  onSwitchToRegister: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoUsername: string) => {
    setError(null);
    setLoading(true);
    try {
      await login(demoUsername, 'password123');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b12]/90 backdrop-blur-md p-4 select-none animate-fade-in">
      <div className="bg-[#121a2a] border border-[#1f2d45] rounded-3xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white mb-3 shadow-xl shadow-indigo-500/25">
            <Video size={30} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Agent Social Media Platform</h1>
          <p className="text-xs text-slate-400 mt-1">Next-Gen Real-Time Audio & Video Collaboration</p>
        </div>

        {/* Quick Demo Logins */}
        <div className="mb-6 p-3.5 bg-[#0a0f18] rounded-2xl border border-[#1f2d45]">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold mb-2.5">
            <Sparkles size={14} />
            <span>Instant Demo Accounts (Click to test):</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('alice')}
              className="px-2 py-2 rounded-xl bg-[#141e30] hover:bg-[#1a263c] border border-[#28395a] text-xs text-slate-200 font-medium transition flex flex-col items-center gap-1 group"
            >
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100"
                alt="Alice"
                className="w-8 h-8 rounded-full object-cover group-hover:scale-105 transition"
              />
              <span>Alice</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('bob')}
              className="px-2 py-2 rounded-xl bg-[#141e30] hover:bg-[#1a263c] border border-[#28395a] text-xs text-slate-200 font-medium transition flex flex-col items-center gap-1 group"
            >
              <img
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100"
                alt="Bob"
                className="w-8 h-8 rounded-full object-cover group-hover:scale-105 transition"
              />
              <span>Bob</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleDemoLogin('charlie')}
              className="px-2 py-2 rounded-xl bg-[#141e30] hover:bg-[#1a263c] border border-[#28395a] text-xs text-slate-200 font-medium transition flex flex-col items-center gap-1 group"
            >
              <img
                src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100"
                alt="Charlie"
                className="w-8 h-8 rounded-full object-cover group-hover:scale-105 transition"
              />
              <span>Charlie</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <UserIcon size={16} />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="alice, bob, or custom username"
                className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock size={16} />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password123"
                className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
          >
            <LogIn size={16} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-cyan-400 hover:underline font-semibold"
            >
              Create one here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
