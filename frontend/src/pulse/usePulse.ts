import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  PulseAgent,
  PulseChannel,
  PulsePost,
  PulseThread,
  ReactionType,
  ReactionUpdate,
} from './types';

const PAGE = 30;
const MAX_TIMELINE = 300;

function baseUrl(): string {
  return window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('calling_token') || localStorage.getItem('wa_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Does a post belong on the currently selected timeline? */
function matchesChannel(post: PulsePost, slug: string): boolean {
  if (slug === 'home') return true;
  if (slug === 'firehose') return post.channel?.kind === 'feed';
  return post.channel?.slug === slug;
}

export type PulseData = ReturnType<typeof usePulse>;

/**
 * Live state for the Pulse feed: channels, one timeline, trending, agent
 * presence, and the viewer's own reactions. REST for history, Socket.IO for
 * everything that happens after the page loaded.
 */
export function usePulse() {
  const [channels, setChannels] = useState<PulseChannel[]>([]);
  const [channel, setChannel] = useState<string>('home');
  const [posts, setPosts] = useState<PulsePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [trending, setTrending] = useState<PulsePost[]>([]);
  const [agents, setAgents] = useState<PulseAgent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<PulseThread | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [shareUrl, setShareUrl] = useState<string>(`${window.location.origin}/pulse`);
  const [unseen, setUnseen] = useState(0);

  const channelRef = useRef(channel);
  channelRef.current = channel;
  const isSignedIn = !!(localStorage.getItem('calling_token') || localStorage.getItem('wa_token'));

  // ---- loaders -------------------------------------------------------------

  const loadChannels = useCallback(async () => {
    try {
      setChannels(await getJson<PulseChannel[]>('/api/pulse/channels'));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load channels');
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await getJson<PulseAgent[]>('/api/pulse/agents'));
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadTrending = useCallback(async () => {
    try {
      setTrending(await getJson<PulsePost[]>('/api/pulse/posts/trending?hours=24&limit=8'));
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadViewerReactions = useCallback(async (ids: string[]) => {
    if (!isSignedIn || ids.length === 0) return;
    try {
      const rows = await postJson<{ postId: string; type: ReactionType }[]>('/api/pulse/posts/viewer-reactions', { postIds: ids });
      setMine((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.add(`${r.postId}:${r.type}`));
        return next;
      });
    } catch {
      /* non-fatal */
    }
  }, [isSignedIn]);

  const loadPosts = useCallback(
    async (slug: string) => {
      setLoading(true);
      try {
        const rows = await getJson<PulsePost[]>(`/api/pulse/posts?channel=${encodeURIComponent(slug)}&limit=${PAGE}`);
        setPosts(rows);
        setHasMore(rows.length === PAGE);
        setUnseen(0);
        setError(null);
        void loadViewerReactions(rows.map((r) => r.id));
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    },
    [loadViewerReactions],
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || posts.length === 0) return;
    const before = posts[posts.length - 1].createdAt;
    setLoading(true);
    try {
      const rows = await getJson<PulsePost[]>(
        `/api/pulse/posts?channel=${encodeURIComponent(channel)}&limit=${PAGE}&before=${encodeURIComponent(before)}`,
      );
      setPosts((prev) => {
        const known = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !known.has(r.id))];
      });
      setHasMore(rows.length === PAGE);
      void loadViewerReactions(rows.map((r) => r.id));
    } finally {
      setLoading(false);
    }
  }, [channel, hasMore, loading, posts, loadViewerReactions]);

  // ---- effects -------------------------------------------------------------

  useEffect(() => {
    void loadChannels();
    void loadAgents();
    void loadTrending();
    getJson<{ primary: { app: string } | null }>('/api/agents/links')
      .then((l) => l.primary && setShareUrl(`${l.primary.app}/pulse`))
      .catch(() => undefined);
    const t = setInterval(() => {
      void loadTrending();
      void loadAgents();
    }, 60_000);
    return () => clearInterval(t);
  }, [loadChannels, loadAgents, loadTrending]);

  useEffect(() => {
    void loadPosts(channel);
  }, [channel, loadPosts]);

  useEffect(() => {
    const socket: Socket = io(baseUrl(), { transports: ['websocket', 'polling'], reconnection: true });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('pulse-subscribe');
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('pulse-post', (post: PulsePost) => {
      if (post.parentId) {
        // A reply: bump the parent's counter wherever it is shown.
        setPosts((prev) => prev.map((p) => (p.id === post.parentId ? { ...p, replyCount: p.replyCount + 1 } : p)));
        setThread((t) => (t && t.post.id === post.parentId ? { ...t, replies: [...t.replies, post] } : t));
        return;
      }
      if (!matchesChannel(post, channelRef.current)) return;
      setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev].slice(0, MAX_TIMELINE)));
      setUnseen((n) => n + 1);
    });

    socket.on('pulse-reaction', (u: ReactionUpdate) => {
      const patch = (p: PulsePost) =>
        p.id === u.postId ? { ...p, likeCount: u.likeCount, repostCount: u.repostCount, replyCount: u.replyCount } : p;
      setPosts((prev) => prev.map(patch));
      setTrending((prev) => prev.map(patch));
      setThread((t) => (t ? { ...t, post: patch(t.post), replies: t.replies.map(patch) } : t));
    });

    socket.on('pulse-agent', (agent: PulseAgent) => {
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.id === agent.id);
        if (idx === -1) return [...prev, agent];
        const next = [...prev];
        next[idx] = { ...next[idx], ...agent };
        return next;
      });
    });

    return () => {
      socket.emit('pulse-unsubscribe');
      socket.disconnect();
    };
  }, []);

  // ---- actions -------------------------------------------------------------

  const react = useCallback(
    async (postId: string, type: ReactionType) => {
      if (!isSignedIn) throw new Error('Sign in to react');
      const key = `${postId}:${type}`;
      setMine((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      try {
        await postJson(`/api/pulse/posts/${postId}/react`, { type });
      } catch (err) {
        setMine((prev) => {
          const next = new Set(prev);
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        });
        throw err;
      }
    },
    [isSignedIn],
  );

  const compose = useCallback(
    async (input: { channel: string; content: string; title?: string; parentId?: string; quoteOfId?: string; images?: string[] }) => {
      if (!isSignedIn) throw new Error('Sign in to post');
      return postJson<PulsePost>('/api/pulse/posts', input);
    },
    [isSignedIn],
  );

  const openThread = useCallback(async (postId: string) => {
    setThread(await getJson<PulseThread>(`/api/pulse/posts/${postId}`));
  }, []);

  const closeThread = useCallback(() => setThread(null), []);
  const markSeen = useCallback(() => setUnseen(0), []);

  const channelBySlug = useMemo(() => new Map(channels.map((c) => [c.slug, c])), [channels]);
  const liveAgents = useMemo(() => agents.filter((a) => a.liveness === 'online'), [agents]);

  return {
    channels,
    channelBySlug,
    channel,
    setChannel,
    posts,
    loading,
    hasMore,
    loadMore,
    trending,
    agents,
    liveAgents,
    connected,
    error,
    thread,
    openThread,
    closeThread,
    mine,
    react,
    compose,
    isSignedIn,
    shareUrl,
    unseen,
    markSeen,
    refresh: () => loadPosts(channel),
  };
}
