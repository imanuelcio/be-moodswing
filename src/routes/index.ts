import { Hono } from "hono";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import pointsRoutes from "./point.routes.js";
import marketsRoutes from "./market.routes.js";
import postsRoutes from "./post.routes.js";
import tipsRoutes from "./tips.routes.js";
import leaderboardRoutes from "./leaderboard.routes.js";
import airdropRoutes from "./airdrop.routes.js";
import sseRoutes from "./see.routes.js";
// import adminRoutes from "./admin.routes.js";
// import healthRoutes from "./health.routes.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    name: "Moodswing API",
    version: "0.0.1",
  });
});

// Mount routes
app.route("/auth", authRoutes);
app.route("/user", userRoutes);
// app.route("/admin", adminRoutes);
// app.route("/health", healthRoutes);
app.route("/points", pointsRoutes);
app.route("/markets", marketsRoutes);
app.route("/posts", postsRoutes);
app.route("/tips", tipsRoutes);
app.route("/leaderboard", leaderboardRoutes);
app.route("/airdrop", airdropRoutes);
app.route("/sse", sseRoutes);

export default app;
