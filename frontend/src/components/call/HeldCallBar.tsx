import React from 'react';
import { useCall } from '../../context/CallContext';
import { Pause, ArrowLeftRight, GitMerge, PhoneOff } from 'lucide-react';

export const HeldCallBar: React.FC = () => {
  const {
    heldCall,
    swapHeldAndActiveCall,
    mergeHeldCallIntoActive,
    endHeldCall,
  } = useCall();

  if (!heldCall) return null;

  return (
    <div className="w-full px-6 py-2 bg-[#182338]/90 border-b border-amber-500/30 backdrop-blur-md flex items-center justify-between z-30 animate-slide-up">
      <div className="flex items-center gap-2.5">
        <span className="p-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <Pause size={14} />
        </span>
        <div>
          <p className="text-xs font-bold text-amber-300">
            Call with {heldCall.roomTitle} on Hold
          </p>
          <p className="text-[10px] text-slate-400">
            {heldCall.isGroup ? 'Group Conference' : 'Direct Call'} • Paused
          </p>
        </div>
      </div>

      {/* Held Call Controls */}
      <div className="flex items-center gap-2">
        {/* Swap Calls */}
        <button
          onClick={swapHeldAndActiveCall}
          className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-300 flex items-center gap-1.5 transition"
          title="Swap between active call and held call"
        >
          <ArrowLeftRight size={13} />
          <span>Swap Calls</span>
        </button>

        {/* Merge Conference */}
        <button
          onClick={mergeHeldCallIntoActive}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-xs font-semibold text-white flex items-center gap-1.5 transition shadow-sm"
          title="Merge held call into active conference"
        >
          <GitMerge size={13} />
          <span>Merge Calls</span>
        </button>

        {/* End Held Call */}
        <button
          onClick={endHeldCall}
          className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition"
          title="Hang up held call"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    </div>
  );
};
