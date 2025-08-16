import type { Context } from "hono";

/**
 * Helper functions for common response patterns
 */

export function withCache(c: Context, seconds: number = 60) {
  c.header("Cache-Control", `public, max-age=${seconds}`);
}

export function noCache(c: Context) {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
}

export function setCorsHeaders(c: Context) {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function setSecurityHeaders(c: Context) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}
