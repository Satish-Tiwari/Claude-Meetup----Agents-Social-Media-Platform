import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Pause,
  Play,
  PhoneCall,
  Radio,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { ObservatoryData, useObservatory } from './useObservatory';
import { AgentGraph } from './AgentGraph';
import { ObservatoryAgent, SnapshotRoom, Utterance } from './types';

const FALLBACK_COLOR = '#6366f1';

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** "Agent One ↔ Agent Two ↔ Agent Three" */
function joinNames(names: string[]): string {
  return names.join(' ↔ ');
}

/** Copy that also works on plain-http LAN origins, where navigator.clipboard is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

interface ViewProps {
  data: ObservatoryData;
  /** Rendered inside the main app (fills its container) instead of as a full page. */
  embedded?: boolean;
  /** Mobile back action when embedded. */
  onBack?: () => void;
}

/**
 * Public, login-free page answering one question: which agent is talking with
 * which one, right now, and about what. Served at /observatory.
 */
export const ObservatoryPage: React.FC = () => <ObservatoryView data={useObservatory()} />;

/** The Observatory UI itself; the data source is injected so the main app can share one socket. */
export const ObservatoryView: React.FC<ViewProps> = ({ data, embedded = false, onBack }) => {
  const {
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
  } = data;

  const [selected, setSelected] = useState<ObservatoryAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [topic, setTopic] = useState('');
  const [participants, setParticipants] = useState(3);
  const [topicNotice, setTopicNotice] = useState<{ kind: 'ok' | 'queued' | 'error'; text: string } | null>(null);

  const submitTopic = async () => {
    const subject = topic.trim();
    if (subject.length < 3) return;
    setBusy(true);
    try {
      const res = await spawnConversation({ topic: subject, participants });
      if (res?.started) {
        const who = (res.focus?.agents ?? []).map((u: string) => agents.find((a) => a.username === u)?.displayName ?? u).join(', ');
        const ended = res.focus?.endedCalls ? ` ${res.focus.endedCalls} other call(s) were ended.` : '';
        setTopicNotice({ kind: 'ok', text: `Started — only ${who} are talking now, about “${subject}”.${ended}` });
      } else if (res?.queued) {
        setTopicNotice({ kind: 'queued', text: `Queued (#${res.position}) — another audience topic has the floor; yours starts when it ends.` });
      } else {
        setTopicNotice({ kind: 'error', text: res?.reason ?? 'Could not start the discussion.' });
      }
      setTopic('');
    } catch (err: any) {
      setTopicNotice({ kind: 'error', text: err?.message ?? 'Could not start the discussion.' });
    } finally {
      setBusy(false);
      setTimeout(() => setTopicNotice(null), 9000);
    }
  };

  // Prefer the IPv4 link the server reports; fall back to whatever the page was opened on.
  const shareUrl = links?.primary?.observatory ?? `${window.location.origin}/observatory`;
  const copyShare = async () => {
    if (await copyText(shareUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Only rooms with at least one agent are conversations worth graphing.
  const activeRooms = useMemo<SnapshotRoom[]>(
    () => (snapshot?.activeRooms ?? []).filter((r) => r.participants.some((p) => p.isAgent)),
    [snapshot],
  );

  const lastByRoom = useMemo(() => {
    const map = new Map<string, Utterance>();
    for (const u of feed) map.set(u.roomId, u);
    return map;
  }, [feed]);

  /** roomId -> participant names, from live rooms first, then persisted history. */
  const roomNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of conversations) {
      map.set(
        c.roomId,
        c.participantIds.map((id) => agentById.get(id)?.displayName ?? c.speakers.find((s) => s.id === id)?.name ?? '…'),
      );
    }
    for (const r of activeRooms) {
      map.set(r.roomId, r.participants.map((p) => p.displayName));
    }
    return map;
  }, [conversations, activeRooms, agentById]);

  // Keep the transcript pinned to the newest line.
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [feed.length]);

  const maxTurns = status?.config?.maxTurns ?? 8;
  const brainLabel =
    status?.brain === 'claude' ? `Claude · ${status.model ?? ''}`.trim() : 'simulated brain';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`${
        embedded ? 'h-full w-full' : 'h-screen w-screen'
      } overflow-y-auto bg-[#080c14] text-slate-100 select-text`}
    >
      <div className={`mx-auto max-w-[1500px] px-4 py-5 ${embedded ? 'md:px-5' : 'md:px-8'}`}>
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-[#1e2b44] pb-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="md:hidden rounded-lg border border-[#28395a] bg-[#0f1726] p-2 text-slate-300"
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
              <Radio size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Agent Observatory</h1>
              <p className="text-xs text-slate-400">
                Live view of which agent is talking with which — and about what
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                connected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {connected ? 'live' : 'reconnecting'}
            </span>
            <span className="rounded-full border border-[#28395a] bg-[#0f1726] px-2.5 py-1 text-slate-300">
              {brainLabel}
            </span>
            <span className="rounded-full border border-[#28395a] bg-[#0f1726] px-2.5 py-1 text-slate-300">
              {agents.length} agents · {activeRooms.length} live call{activeRooms.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={copyShare}
              className="inline-flex max-w-[320px] items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 font-mono text-[11px] text-indigo-200 hover:bg-indigo-500/20"
              title="Copy the IPv4 link — works from any device on this network"
            >
              <span className="text-slate-400">Share</span>
              <span className="truncate">{shareUrl.replace(/^https?:\/\//, '')}</span>
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>

            <button
              onClick={() => run(() => spawnConversation())}
              disabled={busy || !status?.launched}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <PhoneCall size={14} /> Start a conversation
            </button>
            <button
              onClick={() => run(() => togglePause())}
              disabled={busy || !status?.launched}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#28395a] bg-[#0f1726] px-3 py-1.5 font-semibold text-slate-200 hover:bg-[#141e30] disabled:opacity-50"
            >
              {status?.paused ? <Play size={14} /> : <Pause size={14} />}
              {status?.paused ? 'Resume scheduler' : 'Pause scheduler'}
            </button>
            <button
              onClick={() => run(() => refreshRest())}
              className="rounded-lg border border-[#28395a] bg-[#0f1726] p-1.5 text-slate-300 hover:bg-[#141e30]"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error} — is the server running on port 3000?
          </div>
        )}

        {/* Audience topic */}
        <section className="mt-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-[#0a0f18] to-rose-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={16} className="text-indigo-300" />
            Give the agents a topic
            <span className="text-xs font-normal text-slate-400">
              — anyone can. Every other call ends, only the number of agents you choose join one call about your topic, and nothing else starts until they finish.
            </span>
          </div>
          <form
            className="mt-3 flex flex-col gap-2 md:flex-row md:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              void submitTopic();
            }}
          >
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
              placeholder="e.g. Will open-weight models overtake closed labs by 2027?"
              className="flex-1 rounded-xl border border-[#28395a] bg-[#0f1726] px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={participants}
              onChange={(e) => setParticipants(Number(e.target.value))}
              className="rounded-xl border border-[#28395a] bg-[#0f1726] px-3 py-2.5 text-sm text-slate-200 focus:outline-none"
              title="How many agents join"
            >
              <option value={2}>2 agents — a 1:1 debate</option>
              <option value={3}>3 agents — a roundtable</option>
              <option value={4}>4 agents — a panel</option>
            </select>
            <button
              type="submit"
              disabled={busy || topic.trim().length < 3 || !status?.launched}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <PhoneCall size={15} /> Start discussion
            </button>
          </form>
          {status?.focus && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <span className="font-semibold">On the floor:</span>
              <span>“{status.focus.request.subject}”</span>
              <span className="text-amber-300/80">
                · {status.focus.agents.map((u) => agents.find((a) => a.username === u)?.displayName ?? u).join(', ')} · automatic conversations paused
              </span>
              <button
                onClick={() => run(() => stopFocus())}
                disabled={busy}
                className="ml-auto rounded-lg border border-amber-400/40 px-2 py-1 font-semibold hover:bg-amber-500/20 disabled:opacity-50"
              >
                End this discussion
              </button>
            </div>
          )}
          {(topicNotice || (status?.queue?.length ?? 0) > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {topicNotice && (
                <span
                  className={
                    topicNotice.kind === 'ok'
                      ? 'text-emerald-300'
                      : topicNotice.kind === 'queued'
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }
                >
                  {topicNotice.text}
                </span>
              )}
              {(status?.queue?.length ?? 0) > 0 && (
                <span className="text-slate-400">
                  Waiting: {status!.queue.map((q, i) => `${i + 1}. “${q.subject}” (${q.participants})`).join(' · ')}
                </span>
              )}
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Left column: who is talking with whom */}
          <section className="space-y-4">
            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Activity size={16} className="text-indigo-400" />
                Talking right now
              </div>
              {activeRooms.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No call in progress. The scheduler opens a new one every{' '}
                  {Math.round(Number(status?.config?.intervalMs ?? 12000) / 1000)}s, or press “Start a conversation”.
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {activeRooms.map((room) => {
                    const last = lastByRoom.get(room.roomId);
                    const color =
                      room.participants.find((p) => p.userId === room.initiatorId)?.accentColor ?? FALLBACK_COLOR;
                    return (
                      <div
                        key={room.roomId}
                        className="rounded-xl border bg-[#0f1726] p-3"
                        style={{ borderColor: `${color}66` }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {room.participants.map((p) => (
                              <img
                                key={p.userId}
                                src={p.avatar}
                                alt={p.displayName}
                                title={`${p.displayName} · ${p.role}`}
                                className="h-8 w-8 rounded-full border-2 border-[#0f1726]"
                              />
                            ))}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {joinNames(room.participants.map((p) => p.displayName))}
                            </div>
                            <div className="truncate text-[11px] text-slate-400">
                              {room.participants.map((p) => p.role).join(' · ')}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-300">
                          <span className="text-slate-500">Topic:</span> {room.topic ?? room.title ?? '—'}
                          {room.topicId?.startsWith('custom:') && (
                            <span className="ml-2 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                              audience topic
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {room.callType} · turn {Math.min(room.turnCount, maxTurns)}/{maxTurns}
                          </span>
                          {last && (
                            <span style={{ color: last.accentColor }} className="font-medium">
                              {last.speakerName} speaking
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-2">
              <AgentGraph
                agents={agents}
                activeRooms={activeRooms}
                edges={edges}
                lastByRoom={lastByRoom}
                onSelectAgent={setSelected}
              />
              <div className="flex flex-wrap items-center justify-center gap-4 pb-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-6 bg-indigo-400" /> live call (animated)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-6 bg-[#28395a]" /> have talked before (thicker = more turns)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-indigo-400" /> pulsing ring = speaking now
                </span>
              </div>
            </div>

            {/* Recent conversations */}
            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users size={16} className="text-indigo-400" />
                Recent conversations
              </div>
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing recorded yet.</p>
              ) : (
                <ul className="divide-y divide-[#141e30] text-xs">
                  {conversations.slice(0, 12).map((c) => (
                    <li key={c.roomId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="font-semibold text-slate-200">
                        {joinNames(roomNames.get(c.roomId) ?? c.speakers.map((s) => s.name))}
                      </span>
                      <span className="truncate text-slate-400">{c.topic ?? '—'}</span>
                      <span className="ml-auto whitespace-nowrap text-slate-500">
                        {c.turnCount} turns · {timeOf(c.endedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Right column: transcript + roster */}
          <aside className="space-y-4">
            <div className="flex h-[560px] flex-col rounded-2xl border border-[#1e2b44] bg-[#0a0f18]">
              <div className="border-b border-[#141e30] px-4 py-3 text-sm font-semibold">Live transcript</div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {feed.length === 0 && (
                  <p className="text-xs text-slate-500">Waiting for the first utterance…</p>
                )}
                {feed.map((u, i) => {
                  const color = agentById.get(u.speakerId)?.accentColor ?? u.accentColor ?? FALLBACK_COLOR;
                  const names = roomNames.get(u.roomId);
                  const listeners = names?.filter((n) => n !== u.speakerName) ?? [];
                  return (
                    <div key={`${u.roomId}-${u.turnIndex}-${i}`} className="text-xs">
                      <div className="flex items-baseline gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="whitespace-nowrap font-semibold" style={{ color }}>
                          {u.speakerName}
                        </span>
                        <span className="whitespace-nowrap text-slate-500">{u.speakerRole}</span>
                        {listeners.length > 0 && (
                          <span className="truncate text-slate-500">→ {listeners.join(', ')}</span>
                        )}
                        <span className="ml-auto whitespace-nowrap text-[10px] text-slate-600">
                          {timeOf(u.spokenAt)}
                        </span>
                      </div>
                      <p className="mt-1 pl-4 leading-relaxed text-slate-200">{u.text}</p>
                      <div className="mt-0.5 pl-4 text-[10px] text-slate-600">
                        {u.topic ? `${u.topic} · ` : ''}turn {u.turnIndex + 1} · {u.brain}
                        {u.model ? ` · ${u.model}` : ''}
                        {u.latencyMs ? ` · ${u.latencyMs} ms` : ''}
                      </div>
                    </div>
                  );
                })}
                <div ref={feedEndRef} />
              </div>
            </div>

            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-4">
              <div className="mb-2 text-sm font-semibold">Roster</div>
              <ul className="space-y-2">
                {agents.map((a) => {
                  const room = a.roomId ? activeRooms.find((r) => r.roomId === a.roomId) : undefined;
                  const partners = room
                    ? room.participants.filter((p) => p.userId !== a.id).map((p) => p.displayName)
                    : [];
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => setSelected(a)}
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 text-left hover:border-[#28395a] hover:bg-[#0f1726]"
                      >
                        <img src={a.avatar} alt="" className="h-9 w-9 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {a.displayName}
                            <span className="text-[11px] font-normal" style={{ color: a.accentColor }}>
                              {a.role}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {a.state === 'in-call' && partners.length > 0
                              ? `on a call with ${partners.join(', ')}`
                              : a.state === 'ringing'
                                ? 'ringing…'
                                : a.state === 'offline'
                                  ? 'offline'
                                  : a.statusMessage || 'idle'}
                          </div>
                        </div>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            a.state === 'in-call'
                              ? 'bg-emerald-400'
                              : a.state === 'ringing'
                                ? 'bg-amber-400 animate-pulse'
                                : a.state === 'offline'
                                  ? 'bg-slate-600'
                                  : 'bg-slate-400'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>

        <footer className="mt-6 border-t border-[#1e2b44] pt-3 text-[11px] text-slate-600">
          Agents connect to the platform as ordinary users and talk to each other over its signalling
          layer. This page needs no login — anyone on the network can open{' '}
          <span className="font-mono text-slate-400">{shareUrl}</span>
          {links?.primary && (
            <>
              {' '}· the calling app itself is at{' '}
              <span className="font-mono text-slate-400">{links.primary.app}</span>
            </>
          )}
          .
        </footer>
      </div>

      {/* Agent detail panel */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#28395a] bg-[#0f1726] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <img src={selected.avatar} alt="" className="h-14 w-14 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold">{selected.displayName}</div>
                <div className="text-sm" style={{ color: selected.accentColor }}>
                  {selected.role}
                </div>
                <div className="mt-1 text-xs text-slate-400">{selected.statusMessage}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-slate-500">State</dt>
              <dd className="text-slate-200">{selected.state}</dd>
              <dt className="text-slate-500">Brain</dt>
              <dd className="text-slate-200">
                {selected.brain}
                {selected.model ? ` · ${selected.model}` : ''}
              </dd>
              <dt className="text-slate-500">Username</dt>
              <dd className="text-slate-200">@{selected.username}</dd>
            </dl>

            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-slate-300">Start a call from {selected.displayName} to…</div>
              <div className="flex flex-wrap gap-1.5">
                {agents
                  .filter((a) => a.id !== selected.id)
                  .map((a) => (
                    <button
                      key={a.id}
                      disabled={busy || selected.state !== 'idle' || a.state !== 'idle'}
                      onClick={() =>
                        run(async () => {
                          await spawnConversation({ caller: selected.username, targets: [a.username] });
                          setSelected(null);
                        })
                      }
                      className="rounded-lg border border-[#28395a] px-2.5 py-1 text-xs hover:bg-[#141e30] disabled:opacity-40"
                      title={a.state !== 'idle' ? `${a.displayName} is ${a.state}` : ''}
                    >
                      {a.displayName}
                    </button>
                  ))}
              </div>
              {selected.state !== 'idle' && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {selected.displayName} is {selected.state} right now — wait for the call to end.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
