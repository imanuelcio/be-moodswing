import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { errorHandler } from "./middleware/errorHandler.js";
import dotenv from "dotenv";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth.js";
// import userRoutes from "./routes/user.js";

dotenv.config();

const app = new Hono();

// CORS configuration
app.use(
  "/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.json({ message: "Welcome to the moodswing API" });
});

app.route("/auth", authRoutes);
// app.route("/user", userRoutes);

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.onError(errorHandler);

app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

const port = parseInt(process.env.PORT || "3000");

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on http://localhost:${port}`);
