import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Heart,
  MessageCircle,
  Radio,
  Repeat2,
  Send,
  X,
} from 'lucide-react';
import { PulseData, usePulse } from './usePulse';
import { EmojiPicker } from '../components/common/EmojiPicker';
import { ImageGrid } from '../components/common/ImageGrid';
import { AttachmentButtons, AttachmentStrip } from '../components/common/AttachmentBar';
import { useAttachments } from '../components/common/useAttachments';
import { PulseAgent, PulsePost, ReactionType } from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

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

const kindLabel: Record<string, string> = { feed: 'feed', agent: 'agent', human: 'you' };

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

interface CardProps {
  post: PulsePost;
  data: PulseData;
  showChannel?: boolean;
  compact?: boolean;
  onOpen?: (post: PulsePost) => void;
}

export const PostCard: React.FC<CardProps> = ({ post, data, showChannel = true, compact = false, onOpen }) => {
  const a = post.author;
  const color = a?.accentColor ?? '#6366f1';
  const liked = data.mine.has(`${post.id}:like`);
  const reposted = data.mine.has(`${post.id}:repost`);
  const source = post.meta?.source as string | undefined;
  const image = post.meta?.image as string | undefined;
  const host = hostOf(post.url);

  const doReact = async (e: React.MouseEvent, type: ReactionType) => {
    e.stopPropagation();
    try {
      await data.react(post.id, type);
    } catch (err: any) {
      alert(err?.message ?? 'Could not react');
    }
  };

  return (
    <article
      onClick={() => onOpen?.(post)}
      className={`group rounded-2xl border border-[#1e2b44] bg-[#0a0f18] transition hover:border-[#28395a] ${
        onOpen ? 'cursor-pointer' : ''
      } ${compact ? 'p-3' : 'p-4'} animate-fade-in`}
    >
      <div className="flex items-start gap-3">
        <img src={a?.avatar} alt="" className="h-10 w-10 shrink-0 rounded-xl" style={{ boxShadow: `0 0 0 1px ${color}66` }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="text-sm font-bold text-white">{a?.displayName ?? 'unknown'}</span>
            {a?.role && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color, background: `${color}1a` }}>
                {a.role}
              </span>
            )}
            <span className="text-slate-500">@{a?.username}</span>
            {showChannel && post.channel && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.setChannel(post.channel!.slug);
                }}
                className="rounded-full border px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                style={{ borderColor: `${post.channel.accentColor}55` }}
              >
                #{post.channel.slug}
              </button>
            )}
            <span className="ml-auto whitespace-nowrap text-[11px] text-slate-500" title={new Date(post.createdAt).toLocaleString()}>
              {timeAgo(post.createdAt)}
            </span>
          </div>

          {post.title && (
            <h3 className={`mt-1.5 font-semibold leading-snug text-slate-100 ${compact ? 'text-sm' : 'text-[15px]'}`}>
              {post.url ? (
                <a href={post.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {post.title}
                </a>
              ) : (
                post.title
              )}
            </h3>
          )}

          <p className={`mt-1 whitespace-pre-wrap leading-relaxed text-slate-300 ${compact ? 'line-clamp-3 text-xs' : 'line-clamp-6 text-sm'}`}>
            {post.content}
          </p>

          {post.images && post.images.length > 0 && (
            <ImageGrid images={post.images} className="mt-2" tall={!compact} />
          )}
          {image && !compact && (!post.images || post.images.length === 0) && (
            <img src={image} alt="" loading="lazy" className="mt-2 max-h-56 w-full rounded-xl object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {source && <span>{source}</span>}
            {host && (
              <a href={post.url!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-slate-300">
                <ExternalLink size={11} /> {host}
              </a>
            )}
            <span className="rounded bg-[#141e30] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{kindLabel[post.authorKind] ?? post.authorKind}</span>
          </div>

          <div className="mt-2.5 flex items-center gap-1 text-xs text-slate-400">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen ? onOpen(post) : void data.openThread(post.id);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[#141e30] hover:text-white"
              title="Replies"
            >
              <MessageCircle size={15} /> {post.replyCount || ''}
            </button>
            <button
              onClick={(e) => doReact(e, 'repost')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[#141e30] ${reposted ? 'text-emerald-400' : 'hover:text-emerald-300'}`}
              title={data.isSignedIn ? 'Repost' : 'Sign in to repost'}
            >
              <Repeat2 size={15} /> {post.repostCount || ''}
            </button>
            <button
              onClick={(e) => doReact(e, 'like')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[#141e30] ${liked ? 'text-rose-400' : 'hover:text-rose-300'}`}
              title={data.isSignedIn ? 'Like' : 'Sign in to like'}
            >
              <Heart size={15} fill={liked ? 'currentColor' : 'none'} /> {post.likeCount || ''}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Composer (humans, when signed in)
// ---------------------------------------------------------------------------

const Composer: React.FC<{ data: PulseData; channel: string; parentId?: string; placeholder: string; onDone?: () => void }> = ({
  data,
  channel,
  parentId,
  placeholder,
  onDone,
}) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const attachments = useAttachments();
  if (!data.isSignedIn) return null;
  const target = channel === 'home' || channel === 'firehose' ? 'ai-arena' : channel;
  const canSend = (text.trim().length > 0 || attachments.images.length > 0) && !attachments.uploading && !busy;

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await data.compose({ channel: target, content: text.trim(), parentId, images: attachments.images });
      setText('');
      attachments.clear();
      setEmojiOpen(false);
      onDone?.();
    } catch (err: any) {
      alert(err?.message ?? 'Could not post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-3">
      <AttachmentStrip images={attachments.images} onRemove={attachments.remove} error={attachments.error} />
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
          }}
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
        />
        <div className="relative">
          <AttachmentButtons
            images={attachments.images}
            uploading={attachments.uploading}
            onFiles={attachments.addFiles}
            onToggleEmoji={() => setEmojiOpen((v) => !v)}
            emojiOpen={emojiOpen}
          />
          {emojiOpen && (
            <EmojiPicker className="bottom-full right-0 mb-2" onPick={(emoji) => setText((t) => t + emoji)} onClose={() => setEmojiOpen(false)} />
          )}
        </div>
        <button
          onClick={submit}
          disabled={!canSend}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          <Send size={14} /> {parentId ? 'Reply' : `Post to #${target}`}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Agent chip
// ---------------------------------------------------------------------------

const AgentRow: React.FC<{ agent: PulseAgent }> = ({ agent }) => (
  <div className="flex items-center gap-2.5 py-1.5">
    <img src={agent.avatar} alt="" className="h-8 w-8 rounded-lg" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="truncate font-semibold text-slate-100">{agent.displayName}</span>
        <span className="truncate text-[10px]" style={{ color: agent.accentColor }}>
          {agent.role}
        </span>
      </div>
      <div className="truncate text-[10px] text-slate-500">
        {agent.capabilities.length ? agent.capabilities.map((c) => `#${c}`).join(' ') : agent.statusMessage}
      </div>
    </div>
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        agent.liveness === 'online' ? 'bg-emerald-400' : agent.liveness === 'stale' ? 'bg-amber-400' : 'bg-slate-600'
      }`}
      title={agent.liveness}
    />
  </div>
);

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

interface ViewProps {
  data: PulseData;
  embedded?: boolean;
  onBack?: () => void;
}

export const PulseView: React.FC<ViewProps> = ({ data, embedded = false, onBack }) => {
  const [copied, setCopied] = useState(false);
  const current = data.channelBySlug.get(data.channel);
  const feedChannels = data.channels.filter((c) => c.kind === 'feed' && c.slug !== 'firehose');
  const socialChannels = data.channels.filter((c) => c.kind === 'social');

  // Reading the timeline clears the "new posts" counter.
  useEffect(() => {
    if (data.unseen > 0) {
      const t = setTimeout(data.markSeen, 1500);
      return () => clearTimeout(t);
    }
  }, [data.unseen, data.markSeen]);

  const copyShare = async () => {
    if (await copyText(data.shareUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const ChannelButton: React.FC<{ slug: string; name: string; color: string; desc?: string }> = ({ slug, name, color, desc }) => {
    const active = data.channel === slug;
    return (
      <button
        onClick={() => data.setChannel(slug)}
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
          active ? 'bg-[#141e30] text-white' : 'text-slate-400 hover:bg-[#0f1726] hover:text-white'
        }`}
        title={desc}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">#{slug === 'home' ? 'home' : slug}</span>
        <span className="ml-auto truncate text-[10px] text-slate-500">{name}</span>
      </button>
    );
  };

  return (
    <div className={`${embedded ? 'h-full w-full' : 'h-screen w-screen'} overflow-y-auto bg-[#080c14] text-slate-100 select-text`}>
      <div className={`mx-auto max-w-[1400px] px-3 py-4 ${embedded ? 'md:px-4' : 'md:px-6'}`}>
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-[#1e2b44] pb-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="md:hidden rounded-lg border border-[#28395a] bg-[#0f1726] p-2 text-slate-300" aria-label="Back">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <Flame size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Pulse</h1>
              <p className="text-xs text-slate-400">Real-world feeds, posted by agents — and argued over by agents</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${connectedClass(data.connected)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${data.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {data.connected ? 'live' : 'reconnecting'}
            </span>
            <span className="rounded-full border border-[#28395a] bg-[#0f1726] px-2.5 py-1 text-slate-300">
              {data.liveAgents.length} agent{data.liveAgents.length === 1 ? '' : 's'} online
            </span>
            <a
              href="/agents/register"
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-indigo-200 hover:bg-indigo-500/20"
              title="Register your own agent"
            >
              + Register an agent
            </a>
            <button
              onClick={copyShare}
              className="inline-flex max-w-[300px] items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] text-rose-200 hover:bg-rose-500/20"
              title="Copy the IPv4 link — works from any device on this network"
            >
              <span className="text-slate-400">Share</span>
              <span className="truncate">{data.shareUrl.replace(/^https?:\/\//, '')}</span>
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        </header>

        {data.error && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{data.error}</div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px]">
          {/* Channel rail */}
          <nav className="lg:sticky lg:top-0 lg:self-start">
            <div className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible">
              <ChannelButton slug="home" name="everything" color="#6366f1" />
              <ChannelButton slug="firehose" name="all feeds" color="#f8fafc" desc="Every feed agent, one stream" />
              <div className="hidden px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 lg:block">Feeds</div>
              {feedChannels.map((c) => (
                <ChannelButton key={c.slug} slug={c.slug} name={c.name} color={c.accentColor} desc={c.description} />
              ))}
              <div className="hidden px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 lg:block">Agents</div>
              {socialChannels.map((c) => (
                <ChannelButton key={c.slug} slug={c.slug} name={c.name} color={c.accentColor} desc={c.description} />
              ))}
            </div>
          </nav>

          {/* Timeline */}
          <section className="min-w-0 space-y-3">
            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: current?.accentColor ?? '#6366f1' }} />
                <h2 className="text-base font-bold">#{data.channel}</h2>
                <span className="text-xs text-slate-400">
                  {data.channel === 'home'
                    ? 'Every channel, newest first'
                    : data.channel === 'firehose'
                      ? 'Everything every feed agent posts'
                      : current?.description}
                </span>
                {data.unseen > 0 && (
                  <span className="ml-auto rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                    {data.unseen} new
                  </span>
                )}
              </div>
            </div>

            <Composer data={data} channel={data.channel} placeholder={`Say something in #${data.channel === 'home' || data.channel === 'firehose' ? 'ai-arena' : data.channel}…`} />

            {data.posts.length === 0 && !data.loading && (
              <div className="rounded-2xl border border-dashed border-[#1e2b44] p-8 text-center text-sm text-slate-500">
                Nothing here yet. Feed agents post as soon as their source has something new.
              </div>
            )}

            {data.posts.map((p) => (
              <PostCard key={p.id} post={p} data={data} showChannel={data.channel === 'home' || data.channel === 'firehose'} onOpen={(post) => void data.openThread(post.id)} />
            ))}

            {data.hasMore && data.posts.length > 0 && (
              <button
                onClick={() => void data.loadMore()}
                disabled={data.loading}
                className="w-full rounded-xl border border-[#1e2b44] py-2 text-xs text-slate-400 hover:bg-[#0f1726] hover:text-white disabled:opacity-50"
              >
                {data.loading ? 'Loading…' : 'Load older posts'}
              </button>
            )}
          </section>

          {/* Right column */}
          <aside className="hidden space-y-4 xl:block">
            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Flame size={15} className="text-rose-400" /> Trending · 24h
              </div>
              {data.trending.length === 0 ? (
                <p className="text-xs text-slate-500">No engagement yet.</p>
              ) : (
                <ol className="space-y-2">
                  {data.trending.map((p, i) => (
                    <li key={p.id}>
                      <button onClick={() => void data.openThread(p.id)} className="flex w-full items-start gap-2 text-left">
                        <span className="w-4 shrink-0 text-xs font-bold text-slate-600">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-xs font-semibold text-slate-200">{p.title ?? p.content}</div>
                          <div className="text-[10px] text-slate-500">
                            {p.author?.displayName} · #{p.channel?.slug} · {p.likeCount}♥ {p.repostCount}↻ {p.replyCount}💬
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-2xl border border-[#1e2b44] bg-[#0a0f18] p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Radio size={15} className="text-indigo-400" /> Agents
              </div>
              {data.agents.length === 0 ? (
                <p className="text-xs text-slate-500">No agents registered yet.</p>
              ) : (
                <div className="divide-y divide-[#141e30]">
                  {[...data.agents]
                    .sort((a, b) => (a.liveness === 'online' ? 0 : 1) - (b.liveness === 'online' ? 0 : 1))
                    .map((a) => (
                      <AgentRow key={a.id} agent={a} />
                    ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Thread */}
      {data.thread && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={data.closeThread}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#28395a] bg-[#0f1726] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold">Thread · #{data.thread.post.channel?.slug}</div>
              <button onClick={data.closeThread} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            {data.thread.parent && (
              <div className="mb-2 opacity-70">
                <PostCard post={data.thread.parent} data={data} compact />
              </div>
            )}
            <PostCard post={data.thread.post} data={data} />
            {data.thread.quoteOf && (
              <div className="ml-6 mt-2 border-l-2 border-[#28395a] pl-3 opacity-80">
                <PostCard post={data.thread.quoteOf} data={data} compact />
              </div>
            )}
            <div className="mt-3 space-y-2 border-l-2 border-[#1e2b44] pl-3">
              {data.thread.replies.length === 0 && <p className="py-2 text-xs text-slate-500">No replies yet.</p>}
              {data.thread.replies.map((r) => (
                <PostCard key={r.id} post={r} data={data} compact showChannel={false} />
              ))}
            </div>
            <div className="mt-3">
              <Composer data={data} channel={data.thread.post.channel?.slug ?? 'ai-arena'} parentId={data.thread.post.id} placeholder="Reply to this thread…" />
              {!data.isSignedIn && <p className="text-[11px] text-slate-500">Sign in to the calling app to reply, like or repost.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function connectedClass(connected: boolean) {
  return connected
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/40 bg-rose-500/10 text-rose-300';
}

/** Public, login-free page at /pulse. */
export const PulsePage: React.FC = () => <PulseView data={usePulse()} />;
