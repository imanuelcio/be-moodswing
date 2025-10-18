import { z } from "zod";
import { configDotenv } from "dotenv";
configDotenv();
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3010),
  WS_PATH: z.string().default("/realtime"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Auth
  JWT_SECRET: z.string().min(16),
  AUTH_NONCE_EXPIRY: z.coerce.number().default(300),
  // Redis
  REDIS_URL: z.string().default("redis://redis:6379"),

  // Rate Limiting
  RATE_LIMIT_PUBLIC_HOURLY: z.coerce.number().default(3600),
  RATE_LIMIT_B2B_HOURLY: z.coerce.number().default(10000),

  // CORS
  CORS_ORIGINS: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
