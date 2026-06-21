import { type MiddlewareHandler } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { type Logger } from 'pino';
import { runWithContext } from './context.js';

export function requestContextMiddleware(rootLogger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const correlationId = c.req.header('x-correlation-id') ?? uuidv4();
    const requestId = uuidv4();

    const logger = rootLogger.child({ requestId, correlationId });

    logger.info(
      { logEvent: 'REQUEST_RECEIVED', payload: { method: c.req.method, routePath: c.req.routePath } },
      'Request received',
    );

    try {
      await runWithContext({ requestId, correlationId, logger }, () => next());
    } finally {
      logger.info(
        { logEvent: 'REQUEST_COMPLETED', payload: { status: c.res.status } },
        'Request completed',
      );
    }
  };
}
