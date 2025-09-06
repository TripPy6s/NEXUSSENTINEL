import os from "os";

export type Env = "production" | "development" | "test";

export interface AppConfig {
  env: Env;
  serviceName: string;
  host: string;
  port: number;
  corsOrigins: string[]; // ["*"] means open
  rateLimit: {
    globalPerMin: number; // 0 disables
    authPerMin: number; // 0 disables
  };
  security: {
    enableHelmet: boolean;
    enableCSP: boolean;
    enableHSTS: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
    includeBodies: boolean; // only dev
  };
  build: {
    commit: string | undefined;
    node: string;
  };
}

export function getConfig(): AppConfig {
  const env = (process.env.NODE_ENV as Env) || "development";
  const isProd = env === "production";
  const isDev = env === "development";
  const isTest = env === "test";

  const serviceName = process.env.SERVICE_NAME || (isProd ? "nexus-sentinel" : isDev ? "local-dev" : "test-suite");

  const corsEnv = (process.env.CORS_ORIGINS || (isProd ? "" : "*"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigins = corsEnv.length === 0 ? [] : corsEnv;

  const rateDefaultEnv =
    process.env.RATE_LIMIT_DEFAULT_PER_MIN ?? process.env.RATE_LIMIT_PER_MINUTE;
  const rateAuthEnv =
    process.env.RATE_LIMIT_AUTH_PER_MIN ?? process.env.RATE_LIMIT_AUTHZ_PER_MINUTE;
  const rateLimitDefault = Number(
    rateDefaultEnv ?? (isProd ? 100 : isDev ? 1000 : 0)
  );
  const rateLimitAuth = Number(rateAuthEnv ?? (isProd ? 10 : isDev ? 0 : 0));

  const config: AppConfig = {
    env,
    serviceName,
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 200,
    corsOrigins,
    rateLimit: {
      globalPerMin: rateLimitDefault,
      authPerMin: rateLimitAuth,
    },
    security: {
      enableHelmet: !isTest,
      enableCSP: isProd,
      enableHSTS: isProd,
    },
    logging: {
      level: process.env.LOG_LEVEL || (isProd ? "info" : isDev ? "debug" : "error"),
      pretty: isDev,
      includeBodies: isDev,
    },
    build: {
      commit: process.env.GIT_COMMIT,
      node: process.version,
    },
  };

  return config;
}

export function isProduction(cfg: AppConfig) {
  return cfg.env === "production";
}

export function isDevelopment(cfg: AppConfig) {
  return cfg.env === "development";
}

export function isTest(cfg: AppConfig) {
  return cfg.env === "test";
}
