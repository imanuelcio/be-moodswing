import type { Context } from "hono";
import { CreatePostSchema } from "../schemas/index.js";
import {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  searchPosts,
  getTrendingPosts,
} from "../services/posts.service.js";
import { storeIdempotentResponse } from "../lib/idempotency.js";

/**
 * Controller for posts operations
 */

/**
 * Get posts with pagination and filtering
 * GET /posts?limit=50&offset=0&market_id=xxx&user_id=xxx
 */
export async function useGetPosts(c: Context) {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const marketId = c.req.query("market_id");
    const userId = c.req.query("user_id");

    if (limit > 100) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Limit cannot exceed 100",
          },
        },
        400
      );
    }

    const posts = await getPosts(limit, offset, marketId, userId);

    return c.json({
      success: true,
      data: {
        posts,
        pagination: {
          limit,
          offset,
          count: posts.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get posts:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get posts",
        },
      },
      500
    );
  }
}

/**
 * Get single post by ID
 * GET /posts/:id
 */
export async function useGetPost(c: Context) {
  try {
    const postId = c.req.param("id");

    if (!postId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Post ID is required",
          },
        },
        400
      );
    }

    const post = await getPost(postId);

    if (!post) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Post not found",
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { post },
    });
  } catch (error) {
    console.error("Failed to get post:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get post",
        },
      },
      500
    );
  }
}

/**
 * Create new post
 * POST /posts
 */
export async function useCreatePost(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();

    const validatedData = CreatePostSchema.parse(body);

    const post = await createPost(userId, validatedData);

    const response = {
      success: true,
      data: { post },
    };

    await storeIdempotentResponse(c, response, 201);

    return c.json(response, 201);
  } catch (error) {
    console.error("Failed to create post:", error);

    if (error instanceof Error && error.message.includes("validation")) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid post data",
          },
        },
        400
      );
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to create post",
        },
      },
      500
    );
  }
}

/**
 * Update post
 * PUT /posts/:id
 */
export async function useUpdatePost(c: Context) {
  try {
    const postId = c.req.param("id");
    const userId = c.get("userId");
    const body = await c.req.json();

    if (!postId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Post ID is required",
          },
        },
        400
      );
    }

    const validatedData = CreatePostSchema.partial().parse(body);

    const post = await updatePost(postId, userId, validatedData);

    const response = {
      success: true,
      data: { post },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to update post:", error);

    if (error instanceof Error) {
      if (error.message.includes("validation")) {
        return c.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: "Invalid post data",
            },
          },
          400
        );
      }

      if (error.message.includes("not found")) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Post not found",
            },
          },
          404
        );
      }

      if (error.message.includes("not authorized")) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Not authorized to update this post",
            },
          },
          403
        );
      }
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to update post",
        },
      },
      500
    );
  }
}

/**
 * Delete post
 * DELETE /posts/:id
 */
export async function useDeletePost(c: Context) {
  try {
    const postId = c.req.param("id");
    const userId = c.get("userId");

    if (!postId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Post ID is required",
          },
        },
        400
      );
    }

    // Check if user is admin (from context - this would be set by requireAdmin middleware)
    const isAdmin = c.get("isAdmin") || false;

    await deletePost(postId, userId, isAdmin);

    return c.json({
      success: true,
      data: { message: "Post deleted successfully" },
    });
  } catch (error) {
    console.error("Failed to delete post:", error);

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Post not found",
            },
          },
          404
        );
      }

      if (error.message.includes("not authorized")) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Not authorized to delete this post",
            },
          },
          403
        );
      }
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to delete post",
        },
      },
      500
    );
  }
}

/**
 * Get trending posts
 * GET /posts/trending?hours=24&limit=10
 */
export async function useGetTrendingPosts(c: Context) {
  try {
    const hours = parseInt(c.req.query("hours") || "24");
    const limit = parseInt(c.req.query("limit") || "10");

    if (hours > 168) {
      // Max 1 week
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Hours cannot exceed 168 (1 week)",
          },
        },
        400
      );
    }

    if (limit > 50) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Limit cannot exceed 50",
          },
        },
        400
      );
    }

    const posts = await getTrendingPosts(hours, limit);

    return c.json({
      success: true,
      data: { posts },
    });
  } catch (error) {
    console.error("Failed to get trending posts:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get trending posts",
        },
      },
      500
    );
  }
}

/**
 * Search posts
 * GET /posts/search?q=searchterm&limit=20&offset=0
 */
export async function useSearchPosts(c: Context) {
  try {
    const searchTerm = c.req.query("q");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!searchTerm) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Search term is required (query parameter: q)",
          },
        },
        400
      );
    }

    if (searchTerm.length < 2) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Search term must be at least 2 characters",
          },
        },
        400
      );
    }

    if (limit > 50) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Limit cannot exceed 50",
          },
        },
        400
      );
    }

    const posts = await searchPosts(searchTerm, limit, offset);

    return c.json({
      success: true,
      data: {
        posts,
        query: searchTerm,
        pagination: {
          limit,
          offset,
          count: posts.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to search posts:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to search posts",
        },
      },
      500
    );
  }
}
