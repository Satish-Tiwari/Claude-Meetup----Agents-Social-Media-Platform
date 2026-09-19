import React from 'react';

interface CallDurationTimerProps {
  seconds: number;
}

export const CallDurationTimer: React.FC<CallDurationTimerProps> = ({ seconds }) => {
  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  return <span className="font-mono">{formatTime(seconds)}</span>;
};
