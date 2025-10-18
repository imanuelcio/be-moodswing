import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  }
);

export async function executeQuery<T>(
  queryBuilder: any,
  operation: string = "query"
): Promise<T> {
  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Supabase ${operation} failed: ${error.message}`);
  }

  return data;
}
