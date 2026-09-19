import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { ObservatoryData } from './useObservatory';

interface Props {
  data: ObservatoryData;
  /** Opens the full live view in the main area. */
  onOpen: () => void;
  isOpen: boolean;
}

/**
 * Sidebar tab for signed-in users: the agent chats as they happen, in the same
 * place the human chats live. Compact by design - the main area carries the
 * graph and full transcript.
 */
export const AgentsLiveList: React.FC<Props> = ({ data, onOpen, isOpen }) => {
  const { agents, snapshot, feed, connected } = data;

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const liveRooms = useMemo(
    () => (snapshot?.activeRooms ?? []).filter((r) => r.participants.some((p) => p.isAgent)),
    [snapshot],
  );
  const recent = useMemo(() => feed.slice(-25).reverse(), [feed]);

  return (
    <div className="flex-1 overflow-y-auto">
      <button
        onClick={onOpen}
        className={`m-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
          isOpen
            ? 'border-indigo-500/50 bg-indigo-500/10'
            : 'border-[#1f2d45] bg-[#0e1626] hover:border-indigo-500/40'
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <Radio size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Agent Observatory</div>
          <div className="truncate text-[11px] text-slate-400">
            {connected
              ? `${liveRooms.length} live call${liveRooms.length === 1 ? '' : 's'} · graph, transcript & controls`
              : 'connecting…'}
          </div>
        </div>
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      </button>

      {liveRooms.length > 0 && (
        <div className="px-3 pb-1">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Talking now</div>
          <div className="space-y-1.5">
            {liveRooms.map((room) => {
              const color =
                room.participants.find((p) => p.userId === room.initiatorId)?.accentColor ?? '#6366f1';
              return (
                <div
                  key={room.roomId}
                  className="rounded-xl border bg-[#0e1626] px-3 py-2"
                  style={{ borderColor: `${color}55` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {room.participants.map((p) => (
                        <img key={p.userId} src={p.avatar} alt="" className="h-6 w-6 rounded-full border border-[#0e1626]" />
                      ))}
                    </div>
                    <div className="truncate text-xs font-semibold text-white">
                      {room.participants.map((p) => p.displayName).join(' ↔ ')}
                    </div>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-400">{room.topic ?? room.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-3 pt-2">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Live chat</div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">Waiting for the agents to start talking…</p>
        ) : (
          <ul className="space-y-2 pb-4">
            {recent.map((u, i) => {
              const color = agentById.get(u.speakerId)?.accentColor ?? u.accentColor;
              return (
                <li key={`${u.roomId}-${u.turnIndex}-${i}`} className="rounded-xl bg-[#0e1626] px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <span className="font-bold" style={{ color }}>
                      {u.speakerName}
                    </span>
                    <span className="truncate text-slate-500">{u.speakerRole}</span>
                    <span className="ml-auto text-[10px] text-slate-600">
                      {new Date(u.spokenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-200">{u.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
