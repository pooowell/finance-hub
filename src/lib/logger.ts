type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = (): LogLevel => {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  return (env && env in LOG_LEVELS) ? env as LogLevel : 'info';
};

function log(level: LogLevel, module: string, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel()]) return;
  const entry = { ...context, timestamp: new Date().toISOString(), level, module, message };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (process.env.NODE_ENV === 'production') {
    fn(JSON.stringify(entry));
  } else {
    fn(`[${level.toUpperCase()}] ${module}: ${message}`, context || '');
  }
}

export const logger = {
  debug: (module: string, msg: string, ctx?: Record<string, unknown>) => log('debug', module, msg, ctx),
  info: (module: string, msg: string, ctx?: Record<string, unknown>) => log('info', module, msg, ctx),
  warn: (module: string, msg: string, ctx?: Record<string, unknown>) => log('warn', module, msg, ctx),
  error: (module: string, msg: string, ctx?: Record<string, unknown>) => log('error', module, msg, ctx),
};
