import { Hono } from "hono";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
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

export default app;
