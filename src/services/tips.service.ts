/**
 * Service for managing tips between users
 */

import { supabaseAdmin } from "../config/supabase.js";
import type { Tip } from "../types/index.js";
import { transferPoints } from "./points.service.js";

/**
 * Send tip points from one user to another
 */
export async function tipPoints(
  fromUserId: string,
  tipData: TipInput
): Promise<{ tip: Tip; fromBalance: number; toBalance: number }> {
  const { toUser: toUserId, postId, points } = tipData;

  try {
    // Validate users exist
    if (fromUserId === toUserId) {
      throw new Error("Cannot tip yourself");
    }

    // Verify recipient exists
    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", toUserId)
      .single();

    if (recipientError || !recipient) {
      throw new Error("Recipient user not found");
    }

    // If postId provided, verify post exists and belongs to recipient
    if (postId) {
      const { data: post, error: postError } = await supabaseAdmin
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .single();

      if (postError || !post) {
        throw new Error("Post not found");
      }

      if (post.user_id !== toUserId) {
        throw new Error("Post does not belong to the specified recipient");
      }
    }

    // Transfer points between users
    const balances = await transferPoints(
      fromUserId,
      toUserId,
      points,
      postId ? "tip" : "tip_direct",
      postId
    );

    // Create tip record
    const { data: tip, error: tipError } = await supabaseAdmin
      .from("tips")
      .insert({
        from_user: fromUserId,
        to_user: toUserId,
        post_id: postId,
        points,
      })
      .select()
      .single();

    if (tipError) {
      throw new Error(`Failed to create tip record: ${tipError.message}`);
    }

    return {
      tip,
      fromBalance: balances.fromBalance,
      toBalance: balances.toBalance,
    };
  } catch (error) {
    console.error("Failed to send tip:", error);
    throw error;
  }
}

/**
 * Get tips sent by a user
 */
export async function getTipsSent(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: tips, error } = await supabaseAdmin
      .from("tips")
      .select(
        `
        *,
        to_user_data:users!tips_to_user_fkey (address),
        post:posts (content, market_id)
      `
      )
      .eq("from_user", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get sent tips: ${error.message}`);
    }

    return tips || [];
  } catch (error) {
    console.error("Failed to get sent tips:", error);
    throw error;
  }
}

/**
 * Get tips received by a user
 */
export async function getTipsReceived(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: tips, error } = await supabaseAdmin
      .from("tips")
      .select(
        `
        *,
        from_user_data:users!tips_from_user_fkey (address),
        post:posts (content, market_id)
      `
      )
      .eq("to_user", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get received tips: ${error.message}`);
    }

    return tips || [];
  } catch (error) {
    console.error("Failed to get received tips:", error);
    throw error;
  }
}

/**
 * Get tips for a specific post
 */
export async function getPostTips(
  postId: string,
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: tips, error } = await supabaseAdmin
      .from("tips")
      .select(
        `
        *,
        from_user_data:users!tips_from_user_fkey (address)
      `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get post tips: ${error.message}`);
    }

    return tips || [];
  } catch (error) {
    console.error("Failed to get post tips:", error);
    throw error;
  }
}

/**
 * Get tip statistics for a user
 */
export async function getUserTipStats(userId: string): Promise<{
  totalSent: number;
  totalReceived: number;
  tipsSentCount: number;
  tipsReceivedCount: number;
  topTippedPosts: any[];
}> {
  try {
    // Get sent tips stats
    const { data: sentStats, error: sentError } = await supabaseAdmin
      .from("tips")
      .select("points")
      .eq("from_user", userId);

    if (sentError) {
      throw new Error(`Failed to get sent tips stats: ${sentError.message}`);
    }

    // Get received tips stats
    const { data: receivedStats, error: receivedError } = await supabaseAdmin
      .from("tips")
      .select("points")
      .eq("to_user", userId);

    if (receivedError) {
      throw new Error(
        `Failed to get received tips stats: ${receivedError.message}`
      );
    }

    // Get top tipped posts by this user
    const { data: topTippedPosts, error: topTippedError } = await supabaseAdmin
      .from("posts")
      .select(
        `
        id,
        content,
        created_at,
        tips_received:tips!to_user_post_id_fkey (points)
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (topTippedError) {
      throw new Error(
        `Failed to get top tipped posts: ${topTippedError.message}`
      );
    }

    // Calculate totals
    const totalSent = sentStats?.reduce((sum, tip) => sum + tip.points, 0) || 0;
    const totalReceived =
      receivedStats?.reduce((sum, tip) => sum + tip.points, 0) || 0;

    // Process top tipped posts
    const postsWithTotals = (topTippedPosts || [])
      .map((post) => ({
        ...post,
        total_tips:
          post.tips_received?.reduce(
            (sum: number, tip: any) => sum + tip.points,
            0
          ) || 0,
      }))
      .filter((post) => post.total_tips > 0)
      .sort((a, b) => b.total_tips - a.total_tips)
      .slice(0, 5);

    return {
      totalSent,
      totalReceived,
      tipsSentCount: sentStats?.length || 0,
      tipsReceivedCount: receivedStats?.length || 0,
      topTippedPosts: postsWithTotals,
    };
  } catch (error) {
    console.error("Failed to get user tip stats:", error);
    throw error;
  }
}

/**
 * Get recent tipping activity (for feeds)
 */
export async function getRecentTipActivity(
  limit: number = 20,
  hours: number = 24
): Promise<any[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data: tips, error } = await supabaseAdmin
      .from("tips")
      .select(
        `
        *,
        from_user_data:users!tips_from_user_fkey (address),
        to_user_data:users!tips_to_user_fkey (address),
        post:posts (content, market_id, markets (title))
      `
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent tip activity: ${error.message}`);
    }

    return tips || [];
  } catch (error) {
    console.error("Failed to get recent tip activity:", error);
    throw error;
  }
}

/**
 * Get top tippers (users who tip the most)
 */
export async function getTopTippers(
  period: "daily" | "weekly" | "monthly" = "weekly",
  limit: number = 10
): Promise<any[]> {
  try {
    const now = new Date();
    let since: Date;

    switch (period) {
      case "daily":
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "weekly":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "monthly":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(0);
    }

    const { data: tips, error } = await supabaseAdmin
      .from("tips")
      .select(
        `
        from_user,
        points,
        users!tips_from_user_fkey (address)
      `
      )
      .gte("created_at", since.toISOString());

    if (error) {
      throw new Error(`Failed to get top tippers: ${error.message}`);
    }

    // Aggregate tips by user
    const tipperStats = new Map<
      string,
      { userId: string; address: string; totalTipped: number; tipCount: number }
    >();

    for (const tip of tips || []) {
      const existing = tipperStats.get(tip.from_user);
      if (existing) {
        existing.totalTipped += tip.points;
        existing.tipCount += 1;
      } else {
        tipperStats.set(tip.from_user, {
          userId: tip.from_user,
          address: tip.users.address,
          totalTipped: tip.points,
          tipCount: 1,
        });
      }
    }

    // Sort by total tipped and return top N
    return Array.from(tipperStats.values())
      .sort((a, b) => b.totalTipped - a.totalTipped)
      .slice(0, limit);
  } catch (error) {
    console.error("Failed to get top tippers:", error);
    throw error;
  }
}
