import { SupabaseService } from "./supabase.service.js";
import type { User } from "../types/index.js";

export class UserService {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  async getUserProfile(userId: string): Promise<User | null> {
    return await this.supabaseService.getUserById(userId);
  }

  async updateUserProfile(
    userId: string,
    data: Partial<User>
  ): Promise<User | null> {
    return await this.supabaseService.updateUser(userId, data);
  }

  async searchUsers(query: string): Promise<User[]> {
    return await this.supabaseService.searchUsers(query);
  }

  async getUserStats(userId: string): Promise<any> {
    const user = await this.supabaseService.getUserById(userId);

    if (!user) {
      return null;
    }

    return {
      user,
      stats: {
        accountAge: this.calculateAccountAge(user.created_at),
        lastActive: user.last_login,
        profileComplete: this.isProfileComplete(user),
      },
    };
  }

  private calculateAccountAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  private isProfileComplete(user: User): boolean {
    return !!(user.fullname && user.email);
  }
}
