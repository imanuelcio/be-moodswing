import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface User {
  id: string;
  handle: string;
  email?: string;
  created_at: string;
}

export interface CreateUserData {
  handle: string;
  email?: string;
}

export interface UpdateUserData {
  handle?: string;
  email?: string;
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("users")
      .select("id, handle, username, email, created_at")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find user: ${error.message}`);
    }

    return data;
  }

  async findByHandle(handle: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("users")
      .select("id, handle, email, created_at")
      .eq("handle", handle)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find user by handle: ${error.message}`);
    }

    return data;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("users")
      .select("id, handle, email, created_at")
      .eq("email", email)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }

    return data;
  }

  async create(userData: CreateUserData): Promise<User> {
    return executeQuery<User>(
      supabase
        .from("users")
        .insert({
          ...userData,
          created_at: new Date().toISOString(),
        })
        .select("id, handle, email, created_at")
        .single(),
      "create user"
    );
  }

  async update(id: string, userData: UpdateUserData): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError("User", id);
    }

    return executeQuery<User>(
      supabase
        .from("users")
        .update(userData)
        .eq("id", id)
        .select("id, handle, email, created_at")
        .single(),
      "update user"
    );
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError("User", id);
    }

    await executeQuery(
      supabase.from("users").delete().eq("id", id),
      "delete user"
    );
  }

  async list(
    params: {
      offset?: number;
      limit?: number;
      search?: string;
    } = {}
  ): Promise<{ users: User[]; total: number }> {
    const { offset = 0, limit = 50, search } = params;

    let query = supabase
      .from("users")
      .select("id, handle, email, created_at", { count: "exact" });

    if (search) {
      query = query.or(`handle.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    return {
      users: data || [],
      total: count || 0,
    };
  }

  async getUserWithWallets(userId: string) {
    const { data, error } = await supabase
      .from("users")
      .select(
        `
        id, handle, email, created_at,
        user_wallets (
          id, chain_id, address, is_primary, created_at,
          chains (id, key, name, kind)
        )
      `
      )
      .eq("id", userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user with wallets: ${error.message}`);
    }

    return data;
  }
}
