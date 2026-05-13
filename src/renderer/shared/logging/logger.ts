type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  scope: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

function writeLog(payload: LogPayload) {
  const stamp = new Date().toISOString();
  const head = `[${stamp}] [${payload.level.toUpperCase()}] [${payload.scope}] ${payload.message}`;

  if (payload.level === 'error') {
    console.error(head, payload.data ?? '');
    return;
  }

  if (payload.level === 'warn') {
    console.warn(head, payload.data ?? '');
    return;
  }

  if (payload.level === 'debug') {
    console.debug(head, payload.data ?? '');
    return;
  }

  console.info(head, payload.data ?? '');
}

function createLogger(scope: string) {
  // 统一产生日志函数，保持前端日志格式一致便于检索。
  return {
    debug: (message: string, data?: unknown) => writeLog({ scope, level: 'debug', message, data }),
    info: (message: string, data?: unknown) => writeLog({ scope, level: 'info', message, data }),
    warn: (message: string, data?: unknown) => writeLog({ scope, level: 'warn', message, data }),
    error: (message: string, data?: unknown) => writeLog({ scope, level: 'error', message, data })
  };
}

export {
  createLogger
};
