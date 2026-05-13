interface MainLogger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

function createLogger(scope: string): MainLogger {
  function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown) {
    const stamp = new Date().toISOString();
    const head = `[${stamp}] [${level}] [${scope}] ${message}`;

    if (level === 'ERROR') {
      console.error(head, data ?? '');
      return;
    }

    if (level === 'WARN') {
      console.warn(head, data ?? '');
      return;
    }

    console.info(head, data ?? '');
  }

  return {
    info: (message: string, data?: unknown) => log('INFO', message, data),
    warn: (message: string, data?: unknown) => log('WARN', message, data),
    error: (message: string, data?: unknown) => log('ERROR', message, data)
  };
}

export {
  createLogger
};
