// /services/posts.ts

import { supabaseAdmin } from "../config/supabase.js";
import type { Post } from "../types/index.js";

/**
 * Service for managing user posts
 */

/**
 * Create a new post
 */
export async function createPost(
  userId: string,
  postData: CreatePostInput
): Promise<Post> {
  try {
    const { content, externalUrl, marketId } = postData;

    const newPost = {
      user_id: userId,
      content,
      external_url: externalUrl,
      market_id: marketId,
    };

    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .insert(newPost)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create post: ${error.message}`);
    }

    return post;
  } catch (error) {
    console.error("Failed to create post:", error);
    throw error;
  }
}

/**
 * Get posts with pagination and optional filtering
 */
export async function getPosts(
  limit: number = 50,
  offset: number = 0,
  marketId?: string,
  userId?: string
): Promise<Post[]> {
  try {
    let query = supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        users (address),
        markets (title)
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: posts, error } = await query;

    if (error) {
      throw new Error(`Failed to get posts: ${error.message}`);
    }

    return posts || [];
  } catch (error) {
    console.error("Failed to get posts:", error);
    throw error;
  }
}

/**
 * Get a single post by ID
 */
export async function getPost(postId: string): Promise<Post | null> {
  try {
    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        users (address),
        markets (title)
      `
      )
      .eq("id", postId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Post not found
      }
      throw new Error(`Failed to get post: ${error.message}`);
    }

    return post;
  } catch (error) {
    console.error("Failed to get post:", error);
    throw error;
  }
}

/**
 * Update a post (only by owner)
 */
export async function updatePost(
  postId: string,
  userId: string,
  updates: Partial<CreatePostInput>
): Promise<Post> {
  try {
    // Verify ownership
    const existingPost = await getPost(postId);
    if (!existingPost) {
      throw new Error("Post not found");
    }

    if (existingPost.user_id !== userId) {
      throw new Error("Not authorized to update this post");
    }

    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("user_id", userId) // Double-check ownership
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update post: ${error.message}`);
    }

    return post;
  } catch (error) {
    console.error("Failed to update post:", error);
    throw error;
  }
}

/**
 * Delete a post (only by owner or admin)
 */
export async function deletePost(
  postId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  try {
    if (!isAdmin) {
      // Verify ownership for non-admin users
      const existingPost = await getPost(postId);
      if (!existingPost) {
        throw new Error("Post not found");
      }

      if (existingPost.user_id !== userId) {
        throw new Error("Not authorized to delete this post");
      }
    }

    const { error } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) {
      throw new Error(`Failed to delete post: ${error.message}`);
    }
  } catch (error) {
    console.error("Failed to delete post:", error);
    throw error;
  }
}

/**
 * Get posts by market with enhanced data
 */
export async function getMarketPosts(
  marketId: string,
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: posts, error } = await supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        users (id, address),
        tips_received:tips!to_user_post_id_fkey (
          points,
          from_user
        )
      `
      )
      .eq("market_id", marketId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get market posts: ${error.message}`);
    }

    // Calculate tip totals for each post
    const postsWithTips = (posts || []).map((post) => ({
      ...post,
      total_tips:
        post.tips_received?.reduce(
          (sum: number, tip: any) => sum + tip.points,
          0
        ) || 0,
      tip_count: post.tips_received?.length || 0,
    }));

    return postsWithTips;
  } catch (error) {
    console.error("Failed to get market posts:", error);
    throw error;
  }
}

/**
 * Get user's posts with stats
 */
export async function getUserPosts(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: posts, error } = await supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        markets (id, title, status),
        tips_received:tips!to_user_post_id_fkey (
          points,
          from_user,
          users (address)
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get user posts: ${error.message}`);
    }

    // Enhance posts with tip data
    const enhancedPosts = (posts || []).map((post) => ({
      ...post,
      total_tips:
        post.tips_received?.reduce(
          (sum: number, tip: any) => sum + tip.points,
          0
        ) || 0,
      tip_count: post.tips_received?.length || 0,
      recent_tips: post.tips_received?.slice(0, 5) || [],
    }));

    return enhancedPosts;
  } catch (error) {
    console.error("Failed to get user posts:", error);
    throw error;
  }
}

/**
 * Search posts by content
 */
export async function searchPosts(
  searchTerm: string,
  limit: number = 20,
  offset: number = 0
): Promise<Post[]> {
  try {
    const { data: posts, error } = await supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        users (address),
        markets (title)
      `
      )
      .textSearch("content", searchTerm)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to search posts: ${error.message}`);
    }

    return posts || [];
  } catch (error) {
    console.error("Failed to search posts:", error);
    throw error;
  }
}

/**
 * Get trending posts (most tipped recently)
 */
export async function getTrendingPosts(
  hours: number = 24,
  limit: number = 10
): Promise<any[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: posts, error } = await supabaseAdmin
      .from("posts")
      .select(
        `
        *,
        users (address),
        markets (title),
        tips_received:tips!to_user_post_id_fkey (
          points,
          created_at
        )
      `
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get trending posts: ${error.message}`);
    }

    // Calculate recent tip totals and sort by trending score
    const trendingPosts = (posts || [])
      .map((post) => {
        const recentTips =
          post.tips_received?.filter((tip: any) => tip.created_at >= since) ||
          [];

        const recentTipTotal = recentTips.reduce(
          (sum: number, tip: any) => sum + tip.points,
          0
        );

        // Simple trending score: recent tips + recency boost
        const hoursOld =
          (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
        const recencyBoost = Math.max(0, hours - hoursOld) / hours;
        const trendingScore = recentTipTotal + recencyBoost * 100;

        return {
          ...post,
          recent_tip_total: recentTipTotal,
          recent_tip_count: recentTips.length,
          trending_score: trendingScore,
        };
      })
      .filter((post) => post.trending_score > 0)
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, limit);

    return trendingPosts;
  } catch (error) {
    console.error("Failed to get trending posts:", error);
    throw error;
  }
}
