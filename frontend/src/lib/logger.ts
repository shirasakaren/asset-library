type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: Level): boolean {
  return levelOrder[level] >= levelOrder[minLevel];
}

function emit(level: Level, message: string, context?: LogContext) {
  if (!shouldLog(level)) return;
  const payload = context ? { msg: message, ...context } : { msg: message };
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...payload });
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
