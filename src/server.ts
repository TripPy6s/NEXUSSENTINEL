import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pino from "pino";
import pinoHttp from "pino-http";
import morgan from "morgan";
import promClient from "prom-client";
import { getConfig, isDevelopment, isProduction, isTest } from "./config";
import { getRequestId, requestId, requestIdHeader } from "./middleware/requestId";
import { randomUUID } from "crypto";

const cfg = getConfig();

// Logger
const logger = pino({
  level: cfg.logging.level,
  redact: {
    paths: ["req.headers.authorization", "req.body.password", "res.body"],
    censor: "[REDACTED]",
  },
});

const app = express();

// Basic hardening/common
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Request ID
app.use(requestId);

// Logging per request (pino-http) and optional morgan in dev for quick glance
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => getRequestId(req) ?? randomUUID(),
    customProps: (req) => ({ env: cfg.env, service: cfg.serviceName }),
    autoLogging: true,
  })
);
if (isDevelopment(cfg)) {
  app.use(morgan("dev"));
}

// Body parsing
app.use(express.json({ limit: "1mb" }));

// CORS
const allowAll = cfg.corsOrigins.includes("*");
app.use(
  cors({
    origin: allowAll ? true : cfg.corsOrigins,
    credentials: true,
  })
);

// Helmet
if (cfg.security.enableHelmet) {
  const helmetOptions: Parameters<typeof helmet>[0] = {
    contentSecurityPolicy: cfg.security.enableCSP
      ? ({
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
          },
        } as any)
      : false,
    ...(cfg.security.enableHSTS
      ? { hsts: ({ maxAge: Number(process.env.HSTS_MAX_AGE ?? 15552000) } as any) }
      : {}),
    referrerPolicy: ({ policy: "no-referrer" } as any),
    frameguard: ({ action: "deny" } as any),
  };
  app.use(helmet(helmetOptions));
}

// Rate limiting
function makeLimiter(perMin: number) {
  if (perMin <= 0) return (req: Request, res: Response, next: NextFunction) => next();
  return rateLimit({
    windowMs: 60 * 1000,
    limit: perMin,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
app.use(makeLimiter(cfg.rateLimit.globalPerMin));
// Example auth limiter routes placeholder
app.use(["/auth", "/login"], makeLimiter(cfg.rateLimit.authPerMin));

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics();
const httpRequestDurationMs = new promClient.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status"],
  buckets: [50, 100, 200, 300, 400, 500, 1000, 2000],
});
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    httpRequestDurationMs.labels(req.method, req.route?.path || req.path, String(res.statusCode)).observe(duration);
  });
  next();
});

// Build info and version
app.get("/version", (_req, res) => {
  res.json({
    service: cfg.serviceName,
    env: cfg.env,
    node: cfg.build.node,
    commit: cfg.build.commit,
  });
});

// Healthz and Readyz
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
});

app.get("/readyz", async (_req, res) => {
  // In prod you’d check DB/dep here. For now assume healthy unless explicitly disabled.
  const healthy = true;
  if (!healthy && isProduction(cfg)) return res.status(503).json({ ok: false });
  res.json({ ok: true });
});

// Metrics
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// Root
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Nexus Sentinel API",
    message: "Service is running",
    health: "/healthz",
    ready: "/readyz",
    version: "/version",
    ts: Date.now(),
  });
});

// 404 handler
app.use((req, res) => {
  const id = getRequestId(req);
  res.status(404).json({ error: "Not Found", path: req.path, requestId: id });
});

// Error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const id = getRequestId(req);
  const status = err.status || 500;
  const payload: any = { error: err.message || "Internal Server Error", requestId: id };
  if (!isProduction(cfg)) {
    payload.stack = err.stack;
  }
  res.status(status).json(payload);
});

// Start server
const server = app.listen(cfg.port, cfg.host, () => {
  logger.info({ host: cfg.host, port: cfg.port, env: cfg.env }, `Listening on http://${cfg.host}:${cfg.port}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.warn({ signal }, "Shutdown initiated");
  const timeout = setTimeout(() => {
    logger.error("Force exit after timeout");
    process.exit(1);
  }, 30_000);
  server.close((err) => {
    clearTimeout(timeout);
    if (err) {
      logger.error({ err }, "Error closing server");
      process.exit(1);
    }
    logger.info("Server closed cleanly");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
