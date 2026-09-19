import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ConversationSummary,
  GraphEdge,
  ObservatoryAgent,
  OrchestratorStatus,
  ShareLinks,
  Snapshot,
  Utterance,
} from './types';

const MAX_FEED = 120;

function baseUrl(): string {
  // During `vite dev` the page is on 5173 but the API/socket live on the Nest server.
  return window.location.port === '5173'
    ? 'http://localhost:3000'
    : window.location.origin;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Live state for the Observatory.
 *
 * Two sources, deliberately: the Socket.IO feed carries the real-time truth of
 * who is on a call and what was just said, while REST supplies the persisted
 * history that survives a page reload.
 */
export type ObservatoryData = ReturnType<typeof useObservatory>;

export function useObservatory() {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<ObservatoryAgent[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [feed, setFeed] = useState<Utterance[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLinks | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const refreshRest = useCallback(async () => {
    try {
      const [agentRows, graph, convos, st] = await Promise.all([
        getJson<ObservatoryAgent[]>('/api/agents'),
        getJson<{ edges: GraphEdge[] }>('/api/agents/graph'),
        getJson<ConversationSummary[]>('/api/agents/conversations?limit=25'),
        getJson<OrchestratorStatus>('/api/agents/status'),
      ]);
      setAgents(agentRows);
      setEdges(graph.edges);
      setConversations(convos);
      setStatus(st);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load agent data');
    }
  }, []);

  // Seed the feed from persisted turns so a reload is not an empty screen.
  useEffect(() => {
    getJson<any[]>('/api/agents/feed?limit=40')
      .then((rows) => {
        const seeded: Utterance[] = rows
          .slice()
          .reverse()
          .map((r) => ({
            roomId: r.roomId,
            topic: r.topic,
            speakerId: r.speakerId,
            speakerName: r.speakerName,
            speakerUsername: r.speakerUsername,
            speakerRole: r.speakerRole,
            accentColor: '#6366f1',
            text: r.content,
            turnIndex: r.turnIndex,
            order: [],
            brain: r.brain,
            model: r.model,
            latencyMs: r.latencyMs,
            spokenAt: r.createdAt,
          }));
        setFeed(seeded);
      })
      .catch(() => undefined);
  }, []);

  // IPv4 share links: fetched once, they only change if the machine moves network.
  useEffect(() => {
    getJson<ShareLinks>('/api/agents/links').then(setLinks).catch(() => undefined);
  }, []);

  useEffect(() => {
    void refreshRest();
    const poll = setInterval(refreshRest, 8000);
    return () => clearInterval(poll);
  }, [refreshRest]);

  useEffect(() => {
    const socket = io(baseUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('observer-subscribe');
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('observatory-snapshot', (snap: Snapshot) => setSnapshot(snap));

    socket.on('observatory-event', (evt: { event: string; detail: any }) => {
      if (evt.event === 'utterance') {
        const u = evt.detail as Utterance;
        setFeed((prev) => [...prev.slice(-(MAX_FEED - 1)), u]);
      }
      if (evt.event === 'call-ended') {
        // A finished call changes the persisted graph, so pull it again.
        void refreshRest();
      }
    });

    return () => {
      socket.emit('observer-unsubscribe');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshRest]);

  const post = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(`${baseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? `${path} -> ${res.status}`);
      await refreshRest();
      return json;
    },
    [refreshRest],
  );

  const spawnConversation = useCallback(
    (opts?: { caller?: string; targets?: string[]; topicId?: string; topic?: string; participants?: number }) =>
      post('/api/agents/conversations', opts),
    [post],
  );

  const stopFocus = useCallback(async () => {
    const res = await fetch(`${baseUrl()}/api/agents/conversations/focus`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    await refreshRest();
    return json;
  }, [refreshRest]);

  const togglePause = useCallback(
    () => post(status?.paused ? '/api/agents/resume' : '/api/agents/pause'),
    [post, status?.paused],
  );

  return {
    connected,
    agents,
    snapshot,
    feed,
    edges,
    conversations,
    status,
    error,
    links,
    spawnConversation,
    togglePause,
    stopFocus,
    refreshRest,
  };
}
