import React, { useMemo } from 'react';
import { GraphEdge, ObservatoryAgent, SnapshotRoom, Utterance } from './types';

const W = 760;
const H = 560;
const CX = W / 2;
const CY = H / 2 - 10;
const R = 196;
const NODE_R = 34;

interface Props {
  agents: ObservatoryAgent[];
  activeRooms: SnapshotRoom[];
  edges: GraphEdge[];
  lastByRoom: Map<string, Utterance>;
  onSelectAgent?: (agent: ObservatoryAgent) => void;
}

interface Placed {
  agent: ObservatoryAgent;
  x: number;
  y: number;
  angle: number;
}

/**
 * The answer to "who is talking with whom".
 *
 * Three layers, back to front:
 *   1. faint chords  - every pair that has ever exchanged turns (thickness = volume)
 *   2. live arcs     - pairs on a call right now, animated in the caller's colour
 *   3. agent nodes   - ringed by colour, pulsing while that agent holds the floor
 */
export const AgentGraph: React.FC<Props> = ({
  agents,
  activeRooms,
  edges,
  lastByRoom,
  onSelectAgent,
}) => {
  const placed = useMemo<Placed[]>(() => {
    const n = agents.length || 1;
    return agents.map((agent, i) => {
      // Start at the top and go clockwise.
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        agent,
        angle,
        x: CX + Math.cos(angle) * R,
        y: CY + Math.sin(angle) * R,
      };
    });
  }, [agents]);

  const byId = useMemo(
    () => new Map(placed.map((p) => [p.agent.id, p])),
    [placed],
  );

  /** Historical chords, collapsed to one undirected line per pair. */
  const chords = useMemo(() => {
    const merged = new Map<string, { a: string; b: string; turns: number }>();
    for (const e of edges) {
      const [a, b] = [e.source, e.target].sort();
      const key = `${a}|${b}`;
      const found = merged.get(key) ?? { a, b, turns: 0 };
      found.turns += e.turns;
      merged.set(key, found);
    }
    const max = Math.max(1, ...Array.from(merged.values()).map((m) => m.turns));
    return Array.from(merged.values()).map((m) => ({ ...m, weight: m.turns / max }));
  }, [edges]);

  /** Live pairs, one line per pair of participants in each active room. */
  const liveLinks = useMemo(() => {
    const links: {
      key: string;
      a: string;
      b: string;
      color: string;
      roomId: string;
    }[] = [];

    for (const room of activeRooms) {
      const ids = room.participants.map((p) => p.userId);
      const color =
        room.participants.find((p) => p.userId === room.initiatorId)?.accentColor ??
        '#6366f1';
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          links.push({
            key: `${room.roomId}:${ids[i]}:${ids[j]}`,
            a: ids[i],
            b: ids[j],
            color,
            roomId: room.roomId,
          });
        }
      }
    }
    return links;
  }, [activeRooms]);

  const activeAgentIds = useMemo(() => {
    const set = new Set<string>();
    for (const room of activeRooms) {
      for (const p of room.participants) set.add(p.userId);
    }
    return set;
  }, [activeRooms]);

  const speakingIds = useMemo(() => {
    const set = new Set<string>();
    for (const room of activeRooms) {
      const last = lastByRoom.get(room.roomId);
      if (last) set.add(last.speakerId);
    }
    return set;
  }, [activeRooms, lastByRoom]);

  /** One topic label per live room, at the centroid of its participants. */
  const roomLabels = useMemo(() => {
    return activeRooms
      .map((room) => {
        const pts = room.participants
          .map((p) => byId.get(p.userId))
          .filter((p): p is Placed => !!p);
        if (pts.length === 0) return null;

        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const color =
          room.participants.find((p) => p.userId === room.initiatorId)?.accentColor ??
          '#6366f1';

        return {
          roomId: room.roomId,
          topic: room.topic ?? room.title ?? 'Conversation',
          turnCount: room.turnCount,
          size: room.participants.length,
          x: cx,
          y: cy,
          color,
        };
      })
      .filter((l): l is NonNullable<typeof l> => !!l);
  }, [activeRooms, byId]);

  const curve = (ax: number, ay: number, bx: number, by: number) => {
    // Bow each link toward the centre so parallel links stay distinguishable.
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const k = 0.22;
    const qx = mx + (CX - mx) * k;
    const qy = my + (CY - my) * k;
    return `M ${ax} ${ay} Q ${qx} ${qy} ${bx} ${by}`;
  };

  return (
    <div className="relative w-full">
      <style>{`
        @keyframes obsFlow { to { stroke-dashoffset: -28; } }
        @keyframes obsPulse {
          0%,100% { opacity: .35; transform: scale(1); }
          50%     { opacity: .9;  transform: scale(1.12); }
        }
        .obs-flow { animation: obsFlow 1.1s linear infinite; }
        .obs-pulse { animation: obsPulse 1.8s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
      `}</style>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Graph of which agents are talking to which"
      >
        <defs>
          <radialGradient id="obsBg" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#141e30" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0a0f18" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={CX} cy={CY} r={R + 58} fill="url(#obsBg)" />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="#1e2b44"
          strokeWidth={1}
          strokeDasharray="3 7"
        />

        {/* Layer 1 - historical chords */}
        {chords.map((c) => {
          const a = byId.get(c.a);
          const b = byId.get(c.b);
          if (!a || !b) return null;
          return (
            <path
              key={`chord-${c.a}-${c.b}`}
              d={curve(a.x, a.y, b.x, b.y)}
              fill="none"
              stroke="#28395a"
              strokeWidth={1 + c.weight * 4}
              strokeOpacity={0.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Layer 2 - live conversations */}
        {liveLinks.map((l) => {
          const a = byId.get(l.a);
          const b = byId.get(l.b);
          if (!a || !b) return null;
          const d = curve(a.x, a.y, b.x, b.y);
          return (
            <g key={l.key}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={7} strokeOpacity={0.14} strokeLinecap="round" />
              <path
                className="obs-flow"
                d={d}
                fill="none"
                stroke={l.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="10 18"
              />
            </g>
          );
        })}

        {/* Layer 3 - agents */}
        {placed.map(({ agent, x, y, angle }) => {
          const isActive = activeAgentIds.has(agent.id);
          const isSpeaking = speakingIds.has(agent.id);
          const clipId = `clip-${agent.id}`;
          // Push the label outward, away from the circle centre.
          const labelOut = 1;
          const ly = y + Math.sin(angle) * (NODE_R + 20) * labelOut;
          const lx = x + Math.cos(angle) * (NODE_R + 6) * labelOut;
          const anchor: 'start' | 'middle' | 'end' =
            Math.abs(Math.cos(angle)) < 0.35 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';

          return (
            <g
              key={agent.id}
              onClick={() => onSelectAgent?.(agent)}
              style={{ cursor: onSelectAgent ? 'pointer' : 'default' }}
            >
              {isSpeaking && (
                <circle
                  className="obs-pulse"
                  cx={x}
                  cy={y}
                  r={NODE_R + 13}
                  fill="none"
                  stroke={agent.accentColor}
                  strokeWidth={3}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={NODE_R + 5}
                fill="#0a0f18"
                stroke={agent.accentColor}
                strokeWidth={isActive ? 2.5 : 1.25}
                strokeOpacity={isActive ? 1 : 0.4}
              />
              <clipPath id={clipId}>
                <circle cx={x} cy={y} r={NODE_R} />
              </clipPath>
              <image
                href={agent.avatar}
                x={x - NODE_R}
                y={y - NODE_R}
                width={NODE_R * 2}
                height={NODE_R * 2}
                clipPath={`url(#${clipId})`}
                opacity={isActive ? 1 : 0.55}
              />

              <text
                x={lx}
                y={ly}
                textAnchor={anchor}
                className="font-semibold"
                fontSize={14}
                fill={isActive ? '#f8fafc' : '#94a3b8'}
              >
                {agent.displayName}
              </text>
              <text
                x={lx}
                y={ly + 15}
                textAnchor={anchor}
                fontSize={11}
                fill={agent.accentColor}
                opacity={0.85}
              >
                {agent.role}
              </text>
              <text x={lx} y={ly + 30} textAnchor={anchor} fontSize={10} fill="#64748b">
                {isSpeaking ? 'speaking' : isActive ? 'on a call' : agent.state}
              </text>
            </g>
          );
        })}

        {/* Topic chips for each live room */}
        {roomLabels.map((label) => {
          const text =
            label.topic.length > 46 ? `${label.topic.slice(0, 44)}…` : label.topic;
          const width = Math.max(150, text.length * 6.2 + 30);
          return (
            <g key={`label-${label.roomId}`}>
              <rect
                x={label.x - width / 2}
                y={label.y - 17}
                width={width}
                height={34}
                rx={17}
                fill="#0f1726"
                stroke={label.color}
                strokeOpacity={0.6}
              />
              <circle cx={label.x - width / 2 + 15} cy={label.y} r={4} fill={label.color} className="obs-pulse" />
              <text
                x={label.x - width / 2 + 26}
                y={label.y - 1}
                fontSize={10.5}
                fill="#e2e8f0"
              >
                {text}
              </text>
              <text
                x={label.x - width / 2 + 26}
                y={label.y + 11}
                fontSize={9.5}
                fill="#64748b"
              >
                {label.size} participants · turn {label.turnCount}
              </text>
            </g>
          );
        })}

        {activeRooms.length === 0 && (
          <text x={CX} y={CY} textAnchor="middle" fontSize={13} fill="#475569">
            No conversation in progress — waiting for the next one
          </text>
        )}
      </svg>
    </div>
  );
};
