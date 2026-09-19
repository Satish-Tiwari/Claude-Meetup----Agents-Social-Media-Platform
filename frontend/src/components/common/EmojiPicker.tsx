import React, { useEffect, useRef, useState } from 'react';

const GROUPS: { name: string; emojis: string[] }[] = [
  { name: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😢','😭','😤','😠','🤬','🤯','😳','🥵','🥶','😱','😨','🤔','🤫','🤭','🫡','🙄','😬','🥱','😴','🤢','🤮','🤧','😷','🤠','🥸','🤑','😈','👻','💀','🤖','👽','🎃','😺'] },
  { name: 'Gestures', emojis: ['👍','👎','👏','🙌','🤝','🙏','👋','🤙','✌️','🤞','🤟','🤘','👌','🤌','🫶','💪','🖖','☝️','👆','👇','👉','👈','✋','🤚','🖐️','✊','👊','🫵','💅','🧠','👀','👁️','🗣️'] },
  { name: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💯','💢','💥','💫','⭐','🌟','✨','⚡','🔥','🎉','🎊','🏆','🥇'] },
  { name: 'Tech', emojis: ['🤖','💻','🖥️','⌨️','🖱️','📱','📡','🛰️','🔌','🔋','💾','💿','📀','🧮','🔬','🔭','🧪','⚙️','🛠️','🔧','🔩','🧲','📈','📉','📊','🗂️','📎','🔗','🔒','🔓','🔑','🛡️','🧬','🚀','🛸','🌐','📶','🧑‍💻','👩‍💻','👨‍💻'] },
  { name: 'Objects', emojis: ['📰','🗞️','📣','📢','🔔','🔕','📌','📍','🎯','🎲','🎮','🎧','🎤','🎬','📷','📸','🎥','📺','📻','⏰','⌛','💡','🔦','💰','💸','💳','🪙','📦','✉️','📬','📝','📚','🗺️','🧭','🌍','🌎','🌏','☀️','🌧️','⛈️','🌈','❄️','🌪️'] },
  { name: 'Symbols', emojis: ['✅','❌','⚠️','❗','❓','‼️','⁉️','💬','💭','🗨️','🔁','🔀','▶️','⏸️','⏹️','⏩','⏪','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','🆕','🆓','🆗','🆙','🔞','♻️','⚜️','🔰','✔️','➕','➖','➗','✖️','♾️','〰️','©️','®️','™️','#️⃣','0️⃣','1️⃣','2️⃣','3️⃣'] },
];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Tailwind positioning classes for the popover (default: above, left-aligned). */
  className?: string;
}

/**
 * Dependency-free emoji picker: curated groups, click to insert. Closes on
 * outside click or Escape. Works identically in the chat and on Pulse.
 */
export const EmojiPicker: React.FC<Props> = ({ onPick, onClose, className = 'bottom-full left-0 mb-2' }) => {
  const [group, setGroup] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-40 w-[300px] rounded-2xl border border-[#28395a] bg-[#0f1726] p-2 shadow-2xl select-none ${className}`}
      role="dialog"
      aria-label="Emoji picker"
    >
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {GROUPS.map((g, i) => (
          <button
            key={g.name}
            onClick={() => setGroup(i)}
            className={`whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold ${
              i === group ? 'bg-[#182338] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {g.emojis[0]} {g.name}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
        {GROUPS[group].emojis.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-[#1e2b44]"
            title={e}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
};
