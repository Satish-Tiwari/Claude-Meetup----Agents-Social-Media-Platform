import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Lock,
  User as UserIcon,
  Mail,
  LogIn,
  UserPlus,
  Sparkles,
  Video,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export type AuthView = 'login' | 'register' | 'verify-otp' | 'forgot-password' | 'reset-password';

export const AuthModal: React.FC = () => {
  const { login, register, verifyOtp, resendOtp, forgotPassword, resetPassword } = useAuth();

  const [view, setView] = useState<AuthView>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username/email and password');
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      if (err.requiresOtp && err.email) {
        setEmail(err.email);
        setView('verify-otp');
        setSuccessMsg('Please verify the 6-digit OTP code sent to your email.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoUsername: string) => {
    resetMessages();
    setLoading(true);
    try {
      await login(demoUsername, 'password123');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !displayName.trim() || !password.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await register({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
      });
      setEmail(res.email);
      setSuccessMsg(res.message);
      setView('verify-otp');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      await verifyOtp(email.trim(), otp.trim());
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (purpose = 'verification') => {
    resetMessages();
    setResending(true);
    try {
      const res = await resendOtp(email.trim(), purpose);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your account email address');
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccessMsg(res.message);
      setView('reset-password');
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit reset code');
      return;
    }
    if (!password || password.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await resetPassword(email.trim(), otp.trim(), password);
      setSuccessMsg(res.message);
      setPassword('');
      setConfirmPassword('');
      setOtp('');
      setView('login');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b12]/90 backdrop-blur-md p-4 select-none animate-fade-in overflow-y-auto">
      <div className="bg-[#121a2a] border border-[#1f2d45] rounded-3xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden my-auto">
        {/* Ambient glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white mb-3 shadow-xl shadow-indigo-500/25">
            <Video size={30} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Agent Social Media Platform</h1>
          <p className="text-xs text-slate-400 mt-1">Real-Time Video, Audio & Mesh Collaboration</p>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2 animate-fade-in">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* VIEW 1: LOGIN */}
        {view === 'login' && (
          <div>
            {/* Demo Accounts */}
            <div className="mb-6 p-3.5 bg-[#0a0f18] rounded-2xl border border-[#1f2d45]">
              <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold mb-2.5">
                <Sparkles size={14} />
                <span>Instant Demo Accounts (1-Click Login):</span>
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

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username or Email</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon size={16} />
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alice or alice@example.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-400">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      setView('forgot-password');
                    }}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
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
                  onClick={() => {
                    resetMessages();
                    setView('register');
                  }}
                  className="text-cyan-400 hover:underline font-semibold"
                >
                  Create one here
                </button>
              </p>
            </div>
          </div>
        )}

        {/* VIEW 2: REGISTER */}
        {view === 'register' && (
          <div>
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. johndoe"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address * (For OTP)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Display Name *</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 mt-2"
              >
                <UserPlus size={16} />
                <span>{loading ? 'Creating Account & Sending OTP...' : 'Continue to OTP Verification'}</span>
              </button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-xs text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setView('login');
                  }}
                  className="text-cyan-400 hover:underline font-semibold"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        )}

        {/* VIEW 3: VERIFY OTP */}
        {view === 'verify-otp' && (
          <div>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-2.5">
                <KeyRound size={22} />
              </div>
              <h2 className="text-lg font-bold text-white">Enter Verification Code</h2>
              <p className="text-xs text-slate-400 mt-1">
                We sent a 6-digit OTP code to <strong className="text-slate-200">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full py-3 text-center tracking-[12px] font-mono text-2xl bg-[#0a0f18] border border-indigo-500/40 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>{loading ? 'Verifying...' : 'Verify & Enter Platform'}</span>
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setView('login');
                  }}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <ArrowLeft size={13} />
                  <span>Back to login</span>
                </button>

                <button
                  type="button"
                  disabled={resending}
                  onClick={() => handleResendOtp('verification')}
                  className="flex items-center gap-1 text-cyan-400 hover:underline font-semibold disabled:opacity-50"
                >
                  <RefreshCw size={13} className={resending ? 'animate-spin' : ''} />
                  <span>{resending ? 'Resending...' : 'Resend Code'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 4: FORGOT PASSWORD */}
        {view === 'forgot-password' && (
          <div>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2.5">
                <KeyRound size={22} />
              </div>
              <h2 className="text-lg font-bold text-white">Reset Your Password</h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your registered email address to receive a 6-digit reset code.
              </p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-600/25 disabled:opacity-50"
              >
                <span>{loading ? 'Sending Code...' : 'Send Reset Code'}</span>
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setView('login');
                  }}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mx-auto transition"
                >
                  <ArrowLeft size={13} />
                  <span>Back to Sign In</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 5: RESET PASSWORD */}
        {view === 'reset-password' && (
          <div>
            <div className="text-center mb-5">
              <h2 className="text-lg font-bold text-white">Create New Password</h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter the OTP sent to <strong className="text-slate-200">{email}</strong> and your new password.
              </p>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">6-Digit OTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full py-2.5 text-center tracking-[8px] font-mono text-xl bg-[#0a0f18] border border-amber-500/40 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">New Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-600/25 disabled:opacity-50 mt-2"
              >
                <span>{loading ? 'Updating Password...' : 'Save New Password & Log In'}</span>
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setView('login');
                  }}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <ArrowLeft size={13} />
                  <span>Back to login</span>
                </button>

                <button
                  type="button"
                  disabled={resending}
                  onClick={() => handleResendOtp('password_reset')}
                  className="flex items-center gap-1 text-cyan-400 hover:underline font-semibold disabled:opacity-50"
                >
                  <RefreshCw size={13} className={resending ? 'animate-spin' : ''} />
                  <span>{resending ? 'Resending...' : 'Resend Code'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
