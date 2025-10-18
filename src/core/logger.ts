import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "SYS:standard",
          },
        }
      : undefined,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

// Request logger middleware for Hono
export function createRequestLogger() {
  return async (c: any, next: any) => {
    const start = Date.now();
    const reqId = crypto.randomUUID();

    c.set("requestId", reqId);
    c.set("logger", logger.child({ reqId }));

    const reqLogger = c.get("logger");
    reqLogger.info(
      {
        method: c.req.method,
        url: c.req.url,
        userAgent: c.req.header("user-agent"),
      },
      "Request started"
    );

    await next();

    const duration = Date.now() - start;
    reqLogger.info(
      {
        status: c.res.status,
        duration,
      },
      "Request completed"
    );
  };
}
