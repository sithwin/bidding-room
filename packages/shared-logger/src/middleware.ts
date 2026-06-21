import { type MiddlewareHandler } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { type Logger } from 'pino';
import { runWithContext } from './context.js';

export function requestContextMiddleware(rootLogger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const correlationId = c.req.header('x-correlation-id') ?? uuidv4();
    const requestId = uuidv4();

    const logger = rootLogger.child({ requestId, correlationId });

    logger.info({ method: c.req.method, path: c.req.path }, 'request received');

    await runWithContext({ requestId, correlationId, logger }, () => next());

    logger.info({ status: c.res.status }, 'request completed');
  };
}
