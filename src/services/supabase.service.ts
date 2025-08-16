import { createClient } from "@supabase/supabase-js";
import type { User } from "../types/index.js";
import dotenv from "dotenv";

dotenv.config();

export class SupabaseService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("wallet_address", walletAddress.toLowerCase())
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  async upsertUser(userData: Partial<User>): Promise<User> {
    const { data, error } = await this.supabase
      .from("users")
      .upsert(
        {
          ...userData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "wallet_address",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const { data, error } = await this.supabase
      .from("users")
      .update({
        ...userData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await this.supabase.from("users").delete().eq("id", id);

    if (error) {
      throw error;
    }
  }

  async listUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;

    let query = this.supabase.from("users").select("*", { count: "exact" });

    // Add search if provided
    if (options.search) {
      query = query.or(
        `wallet_address.ilike.%${options.search}%,fullname.ilike.%${options.search}%,email.ilike.%${options.search}%`
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      users: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  async searchUsers(query: string): Promise<User[]> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .or(
        `wallet_address.ilike.%${query}%,fullname.ilike.%${query}%,email.ilike.%${query}%`
      )
      .limit(10);

    if (error) {
      throw error;
    }

    return data || [];
  }
}
