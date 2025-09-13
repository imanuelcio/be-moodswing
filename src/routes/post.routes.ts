import { Hono } from "hono";
import * as postsController from "../controllers/posts.controller.js";
import { authMiddleware, optionalAuth } from "../middleware/auth.js";

const postsRoutes = new Hono();
postsRoutes.get("/", optionalAuth(), postsController.useGetPosts);
postsRoutes.get("/:id", optionalAuth(), postsController.useGetPost);
postsRoutes.post("/", authMiddleware, postsController.useCreatePost);
postsRoutes.put("/:id", authMiddleware, postsController.useUpdatePost);
postsRoutes.delete("/:id", authMiddleware, postsController.useDeletePost);
postsRoutes.get("/trending", postsController.useGetTrendingPosts);
postsRoutes.get("/search", postsController.useSearchPosts);

export default postsRoutes;
