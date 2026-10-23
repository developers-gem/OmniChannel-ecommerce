import winston from 'winston';

function safeStringify(obj: any): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(value as any),
        };
      }
      return value;
    });
  } catch (_) {
    return '[Unable to serialize]';
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'multichannel-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, stack, ...rest }) => {
          const restStr = Object.keys(rest).length ? ` ${safeStringify(rest)}` : '';
          return `[${timestamp}] ${level}: ${message}${stack ? `\n${stack}` : ''}${restStr}`;
        })
      ),
    }),
  ],
});
