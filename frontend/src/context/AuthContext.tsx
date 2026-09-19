import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password?: string) => Promise<void>;
  register: (data: {
    username: string;
    email?: string;
    displayName: string;
    password: string;
    avatar?: string;
    statusMessage?: string;
  }) => Promise<{ message: string; email?: string | null; requiresOtp: boolean }>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string, purpose?: string) => Promise<{ message: string }>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ message: string }>;
  logout: () => void;
  quickSwitch: (username: string) => Promise<void>;
  updateUser: (updatedUser: Partial<User>) => void;
  updateTheme: (theme: 'dark' | 'light') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('calling_token') || localStorage.getItem('wa_token'),
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyThemeToDom = (theme: 'dark' | 'light') => {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    localStorage.setItem('calling_theme', theme);
  };

  useEffect(() => {
    const initAuth = async () => {
      const savedTheme = (localStorage.getItem('calling_theme') as 'dark' | 'light') || 'dark';
      applyThemeToDom(savedTheme);

      const savedToken = localStorage.getItem('calling_token') || localStorage.getItem('wa_token');
      if (savedToken) {
        try {
          const profile = await api.getMe();
          setUser(profile);
          setToken(savedToken);
          if (profile.theme === 'light' || profile.theme === 'dark') {
            applyThemeToDom(profile.theme);
          }
        } catch {
          localStorage.removeItem('calling_token');
          localStorage.removeItem('wa_token');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password = 'password123') => {
    const res = await api.login(username, password);
    localStorage.setItem('calling_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    if (res.user.theme === 'light' || res.user.theme === 'dark') {
      applyThemeToDom(res.user.theme);
    }
  };

  const register = async (data: {
    username: string;
    email?: string;
    displayName: string;
    password: string;
    avatar?: string;
    statusMessage?: string;
  }) => {
    const res = await api.register(data);
    // Without OTP the account is live immediately: adopt the session on the spot.
    if (res.accessToken && res.user) {
      localStorage.setItem('calling_token', res.accessToken);
      setToken(res.accessToken);
      setUser(res.user);
      if (res.user.theme === 'light' || res.user.theme === 'dark') applyThemeToDom(res.user.theme);
    }
    return res;
  };

  const verifyOtp = async (email: string, otp: string) => {
    const res = await api.verifyOtp(email, otp);
    localStorage.setItem('calling_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    if (res.user.theme === 'light' || res.user.theme === 'dark') {
      applyThemeToDom(res.user.theme);
    }
  };

  const resendOtp = async (email: string, purpose?: string) => {
    return await api.resendOtp(email, purpose);
  };

  const forgotPassword = async (email: string) => {
    return await api.forgotPassword(email);
  };

  const resetPassword = async (email: string, otp: string, newPassword: string) => {
    return await api.resetPassword({ email, otp, newPassword });
  };

  const logout = () => {
    localStorage.removeItem('calling_token');
    localStorage.removeItem('wa_token');
    setToken(null);
    setUser(null);
  };

  const quickSwitch = async (username: string) => {
    await login(username, 'password123');
  };

  const updateUser = (updatedUser: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
  };

  const updateTheme = async (theme: 'dark' | 'light') => {
    applyThemeToDom(theme);
    setUser((prev) => (prev ? { ...prev, theme } : null));
    try {
      await api.updateTheme(theme);
    } catch (err) {
      console.error('Failed to update theme in database', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
        logout,
        quickSwitch,
        updateUser,
        updateTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
