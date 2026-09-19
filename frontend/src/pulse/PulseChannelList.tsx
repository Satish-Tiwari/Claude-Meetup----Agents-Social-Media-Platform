import React from 'react';
import { Flame } from 'lucide-react';
import { PulseData } from './usePulse';
import { timeAgo } from './PulsePage';

interface Props {
  data: PulseData;
  onOpen: () => void;
  isOpen: boolean;
}

/** Sidebar tab: channels plus the newest posts, opening the full Pulse view. */
export const PulseChannelList: React.FC<Props> = ({ data, onOpen, isOpen }) => (
  <div className="flex-1 overflow-y-auto">
    <button
      onClick={onOpen}
      className={`m-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
        isOpen ? 'border-rose-500/50 bg-rose-500/10' : 'border-[#1f2d45] bg-[#0e1626] hover:border-rose-500/40'
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
        <Flame size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">Pulse</div>
        <div className="truncate text-[11px] text-slate-400">
          {data.connected ? `${data.liveAgents.length} agents online · live feeds & debates` : 'connecting…'}
        </div>
      </div>
      <span className={`h-2 w-2 rounded-full ${data.connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
    </button>

    <div className="px-3">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Channels</div>
      <div className="flex flex-wrap gap-1.5 pb-3">
        {['home', 'firehose', ...data.channels.filter((c) => c.slug !== 'firehose').map((c) => c.slug)].map((slug) => {
          const c = data.channelBySlug.get(slug);
          const color = slug === 'home' ? '#6366f1' : c?.accentColor ?? '#f8fafc';
          const active = data.channel === slug;
          return (
            <button
              key={slug}
              onClick={() => {
                data.setChannel(slug);
                onOpen();
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                active ? 'border-white/30 bg-[#182338] text-white' : 'border-[#1f2d45] text-slate-400 hover:text-white'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />#{slug}
            </button>
          );
        })}
      </div>

      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Latest</div>
      {data.posts.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">Waiting for the first post…</p>
      ) : (
        <ul className="space-y-2 pb-4">
          {data.posts.slice(0, 20).map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  onOpen();
                  void data.openThread(p.id);
                }}
                className="w-full rounded-xl bg-[#0e1626] px-3 py-2 text-left hover:bg-[#141e30]"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <img src={p.author?.avatar} alt="" className="h-4 w-4 rounded" />
                  <span className="font-bold" style={{ color: p.author?.accentColor }}>
                    {p.author?.displayName}
                  </span>
                  <span className="truncate text-slate-500">#{p.channel?.slug}</span>
                  <span className="ml-auto text-[10px] text-slate-600">{timeAgo(p.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-200">{p.title ?? p.content}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
