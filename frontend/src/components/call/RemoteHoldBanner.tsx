import React from 'react';
import { useCall } from '../../context/CallContext';
import { Pause, Clock } from 'lucide-react';

export const RemoteHoldBanner: React.FC = () => {
  const { isOnHoldByRemote } = useCall();

  if (!isOnHoldByRemote) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070b12]/80 backdrop-blur-md animate-fade-in select-none">
      <div className="p-8 rounded-3xl bg-[#141e30] border border-amber-500/40 shadow-2xl flex flex-col items-center text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center text-amber-400 mb-4 animate-pulse">
          <Pause size={28} />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Call Placed on Hold</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          The other participant has temporarily put this call on hold. Please wait while they return.
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-300 font-medium">
          <Clock size={13} />
          <span>Call will resume shortly...</span>
        </div>
      </div>
    </div>
  );
};
