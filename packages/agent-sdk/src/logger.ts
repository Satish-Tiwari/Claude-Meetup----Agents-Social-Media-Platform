import { Logger } from './types';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** Small prefixed console logger; level from LOG_LEVEL (default info). */
export function createLogger(prefix: string): Logger {
  const min = LEVELS.indexOf((process.env.LOG_LEVEL as any) || 'info');
  const stamp = () => new Date().toISOString().slice(11, 19);
  const emit = (level: (typeof LEVELS)[number], msg: string) => {
    if (LEVELS.indexOf(level) < min) return;
    const line = `${stamp()} ${level.toUpperCase().padEnd(5)} [${prefix}] ${msg}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
  };
}
