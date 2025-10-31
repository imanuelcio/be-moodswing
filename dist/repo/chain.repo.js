import { executeQuery, supabase } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class ChainRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("chains")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find chain: ${error.message}`);
        }
        return data;
    }
    async findByKey(key) {
        const { data, error } = await supabase
            .from("chains")
            .select("*")
            .eq("key", key)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find chain by key: ${error.message}`);
        }
        return data;
    }
    async create(chainData) {
        return executeQuery(supabase
            .from("chains")
            .insert({
            ...chainData,
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create chain");
    }
    async update(id, chainData) {
        const chain = await this.findById(id);
        if (!chain) {
            throw new NotFoundError("Chain", id);
        }
        return executeQuery(supabase
            .from("chains")
            .update(chainData)
            .eq("id", id)
            .select("*")
            .single(), "update chain");
    }
    async delete(id) {
        const chain = await this.findById(id);
        if (!chain) {
            throw new NotFoundError("Chain", id);
        }
        await executeQuery(supabase.from("chains").delete().eq("id", id), "delete chain");
    }
    async list() {
        return executeQuery(supabase
            .from("chains")
            .select("*")
            .order("created_at", { ascending: true }), "list chains");
    }
    async findByKind(kind) {
        return executeQuery(supabase
            .from("chains")
            .select("*")
            .eq("kind", kind)
            .order("created_at", { ascending: true }), "find chains by kind");
    }
}
