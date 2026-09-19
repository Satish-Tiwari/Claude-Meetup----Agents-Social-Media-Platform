// Modern Audio Synthesizer using Web Audio API

let audioCtx: AudioContext | null = null;
let ringInterval: any = null;
let dialInterval: any = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const playRingtone = () => {
  stopAllSounds();
  const ctx = getAudioContext();

  const playModernChime = () => {
    try {
      const now = ctx.currentTime;
      // Futuristic, harmonic chime chord (Cmaj9 / Fmaj9)
      const chord = [
        { freq: 523.25, time: 0.0, dur: 0.4 },  // C5
        { freq: 659.25, time: 0.1, dur: 0.5 },  // E5
        { freq: 783.99, time: 0.2, dur: 0.6 },  // G5
        { freq: 987.77, time: 0.35, dur: 0.8 }, // B5
        { freq: 1174.66, time: 0.5, dur: 0.9 }, // D6
      ];

      chord.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.15, now + time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch (e) {
      console.error('Audio ringtone error', e);
    }
  };

  playModernChime();
  ringInterval = setInterval(playModernChime, 2500);
};

export const playDialTone = () => {
  stopAllSounds();
  const ctx = getAudioContext();

  const playSoftPulse = () => {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.error('Dial tone error', e);
    }
  };

  playSoftPulse();
  dialInterval = setInterval(playSoftPulse, 2800);
};

export const playCallEndedTone = () => {
  stopAllSounds();
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.4);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.error('Call end tone error', e);
  }
};

export const stopAllSounds = () => {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (dialInterval) {
    clearInterval(dialInterval);
    dialInterval = null;
  }
};
