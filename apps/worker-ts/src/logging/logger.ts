export type LogFields = Readonly<Record<string, unknown>>
export type LogWriter = (line: string) => void

export interface Logger {
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, error?: unknown, fields?: LogFields): void
  child(fields: LogFields): Logger
}

export function createLogger(
  baseFields: LogFields = {},
  write: LogWriter = console.log,
): Logger {
  function log(level: 'info' | 'warn' | 'error', message: string, fields: LogFields): void {
    write(JSON.stringify({
      ...baseFields,
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      message,
    }))
  }

  return {
    info(message, fields = {}) {
      log('info', message, fields)
    },
    warn(message, fields = {}) {
      log('warn', message, fields)
    },
    error(message, error, fields = {}) {
      log('error', message, {
        ...fields,
        ...(error === undefined ? {} : { error: serializeError(error) }),
      })
    },
    child(fields) {
      return createLogger({ ...baseFields, ...fields }, write)
    },
  }
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}
