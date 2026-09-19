import { User, CallRecord, Message, Friendship, FriendSearchResult } from '../types';

const API_BASE = window.location.port === '5173' ? 'http://localhost:3000/api' : '/api';
/** Origin that serves /uploads (the Nest server, which is a different port only under `vite dev`). */
export const ASSET_BASE = window.location.port === '5173' ? 'http://localhost:3000' : '';

/** Absolute URL for an image path returned by the API. */
export function assetUrl(url: string): string {
  return url.startsWith('/') ? `${ASSET_BASE}${url}` : url;
}

function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('calling_token') || localStorage.getItem('wa_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const api = {
  async login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      const error: any = new Error(err.message || 'Login failed');
      error.requiresOtp = err.requiresOtp;
      error.email = err.email;
      throw error;
    }
    return res.json();
  },

  async register(data: {
    username: string;
    email?: string;
    displayName: string;
    password: string;
    avatar?: string;
    statusMessage?: string;
  }): Promise<{ message: string; email?: string | null; requiresOtp: boolean; accessToken?: string; user?: User }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(err.message || 'Registration failed');
    }
    return res.json();
  },

  /** Upload one image (png/jpeg/gif/webp, <= 5 MB). Returns its /uploads URL. */
  async uploadImage(file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('calling_token') || localStorage.getItem('wa_token');
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(err.message || 'Upload failed');
    }
    return res.json();
  },

  async verifyOtp(email: string, otp: string): Promise<{ accessToken: string; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'OTP verification failed' }));
      throw new Error(err.message || 'OTP verification failed');
    }
    return res.json();
  },

  async resendOtp(email: string, purpose?: string): Promise<{ message: string; email: string }> {
    const res = await fetch(`${API_BASE}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to resend OTP' }));
      throw new Error(err.message || 'Failed to resend OTP');
    }
    return res.json();
  },

  async forgotPassword(email: string): Promise<{ message: string; email: string }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to send reset code' }));
      throw new Error(err.message || 'Failed to send reset code');
    }
    return res.json();
  },

  async resetPassword(data: { email: string; otp: string; newPassword: string }): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to reset password' }));
      throw new Error(err.message || 'Failed to reset password');
    }
    return res.json();
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Session expired');
    return res.json();
  },

  async getUsers(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/users`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load users');
    return res.json();
  },

  async getFriends(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/friends`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load friends');
    return res.json();
  },

  async getIncomingRequests(): Promise<Friendship[]> {
    const res = await fetch(`${API_BASE}/friends/requests/incoming`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load incoming requests');
    return res.json();
  },

  async getOutgoingRequests(): Promise<Friendship[]> {
    const res = await fetch(`${API_BASE}/friends/requests/outgoing`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load outgoing requests');
    return res.json();
  },

  async sendFriendRequest(data: { targetUserId?: string; targetUsername?: string }): Promise<Friendship> {
    const res = await fetch(`${API_BASE}/friends/request`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to send friend request' }));
      throw new Error(err.message || 'Failed to send friend request');
    }
    return res.json();
  },

  async acceptFriendRequest(id: string): Promise<Friendship> {
    const res = await fetch(`${API_BASE}/friends/requests/${id}/accept`, {
      method: 'PATCH',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to accept request');
    return res.json();
  },

  async rejectFriendRequest(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/friends/requests/${id}/reject`, {
      method: 'PATCH',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to reject request');
    return res.json();
  },

  async cancelFriendRequest(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/friends/requests/${id}/cancel`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to cancel request');
    return res.json();
  },

  async removeFriend(friendId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/friends/${friendId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to remove friend');
    return res.json();
  },

  async searchUsers(query: string): Promise<FriendSearchResult[]> {
    const res = await fetch(`${API_BASE}/friends/search?q=${encodeURIComponent(query)}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to search users');
    return res.json();
  },

  async getCalls(): Promise<CallRecord[]> {
    const res = await fetch(`${API_BASE}/calls`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load call history');
    return res.json();
  },

  async deleteCall(callId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/calls/${callId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to delete call record');
    return res.json();
  },

  async clearAllCalls(): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/calls`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to clear call history');
    return res.json();
  },

  async getMessages(otherUserId: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/messages/${otherUserId}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to load messages');
    return res.json();
  },

  async deleteMessage(messageId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to delete message');
    return res.json();
  },

  async clearChat(otherUserId: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/messages/conversation/${otherUserId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to clear chat');
    return res.json();
  },

  async updateProfile(data: { displayName?: string; avatar?: string; statusMessage?: string; theme?: string }): Promise<User> {
    const res = await fetch(`${API_BASE}/users/profile`, {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  async updateTheme(theme: 'dark' | 'light'): Promise<User> {
    const res = await fetch(`${API_BASE}/users/theme`, {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: JSON.stringify({ theme }),
    });
    if (!res.ok) throw new Error('Failed to update theme preference');
    return res.json();
  },

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/users/change-password`, {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to change password' }));
      throw new Error(err.message || 'Failed to change password');
    }
    return res.json();
  },
};
