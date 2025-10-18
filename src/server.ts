// src/server.ts
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./config/env.js";

serve({ fetch: app.fetch, port: env.PORT });
// startWsServer({ port: Number(process.env.WS_PORT || 3020), jwtOptional: true });
console.log(`Server running on http://localhost:${env.PORT}`);
