// services/nft.service.ts
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, findMetadataPda, fetchMetadata, } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { getCollectionByContractAddress, getCollectionById, insertCollection, listTokensWithJoins, upsertToken, getMintedCountByCollectionId, listCollections, } from "../repo/nft.repo.js";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const connection = new Connection(SOLANA_RPC_URL, "confirmed");
// UMI context sekali saja
const umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());
// ===== Schemas =====
export const MintRecordSchema = z.object({
    collectionId: z.number().int().positive(),
    mintAddress: z.string().min(32),
    ownerAddress: z.string().min(32),
});
export const CreateCollectionSchema = z.object({
    chainId: z.number().int().positive().nullable().optional(),
    contractAddress: z.string().min(32), // collection mint (Solana)
    symbol: z.string().optional(),
    name: z.string().optional(),
    royaltiesBps: z.number().int().min(0).max(10000).optional(),
    revenueSharePct: z.number().min(0).max(100).optional(),
});
export const ListTokensQuerySchema = z.object({
    collectionId: z.coerce.number().int().positive().optional(),
    ownerUserId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    order: z.enum(["minted_at_desc", "minted_at_asc"]).optional(),
});
export class NftService {
    static async verifyAndRecordMint(params) {
        const { collectionId, mintAddress, ownerAddress, userId } = params;
        // 1) Ambil koleksi dari DB
        const collection = await getCollectionById(collectionId);
        if (!collection)
            throw new Error("Collection not found");
        // 2) Verifikasi kepemilikan NFT:
        //    Ambil account token TERBESAR untuk mint ini (harus = 1) dan cek owner-nya = ownerAddress
        const mintPk = new PublicKey(mintAddress);
        const largest = await connection.getTokenLargestAccounts(mintPk);
        const top = largest.value[0];
        if (!top?.address)
            throw new Error("No token accounts for this mint");
        // Pastikan balance = 1 (NFT)
        if (top.uiAmount !== 1)
            throw new Error("Invalid NFT balance for largest account");
        // Cek pemilik account token itu = ownerAddress
        const parsedAcc = await connection.getParsedAccountInfo(top.address);
        const parsed = parsedAcc.value?.data;
        const holder = parsed?.parsed?.info?.owner;
        if (!holder || holder !== ownerAddress) {
            throw new Error("Ownership verification failed");
        }
        // 3) Ambil Metadata via UMI & verifikasi collection
        const metadataPda = findMetadataPda(umi, {
            mint: umiPublicKey(mintAddress),
        });
        const metadata = await fetchMetadata(umi, metadataPda);
        // Metadata.collection adalah Option; handle berbagai bentuk (UMI)
        // - Jika Some: { __option: 'Some', value: { key, verified } }
        // - Jika langsung ada field value/verified (versi lama), kita guard juga.
        let isVerified = false;
        let onChainCollectionMint = null;
        const coll = metadata.collection;
        if (coll) {
            // UMI Option style
            if (coll.__option === "Some" && coll.value) {
                isVerified = !!coll.value.verified;
                onChainCollectionMint = coll.value.key?.toString?.() ?? null;
            }
            else if (typeof coll.verified !== "undefined") {
                // fallback bentuk lama
                isVerified = !!coll.verified;
                onChainCollectionMint = coll.key?.toString?.() ?? null;
            }
        }
        if (!isVerified || !onChainCollectionMint) {
            throw new Error("NFT has no verified collection");
        }
        // Cocokkan dengan contract_address koleksi di DB (mint address koleksi)
        if (collection.contract_address &&
            onChainCollectionMint !== collection.contract_address) {
            throw new Error("Collection mismatch");
        }
        // 4) Fetch off-chain JSON metadata dari URI (opsional)
        let offchainMeta = null;
        try {
            const rawUri = metadata.uri ?? metadata.data?.uri ?? "";
            const uri = rawUri.replace(/\0/g, "").trim();
            if (uri && uri.startsWith("http")) {
                const res = await fetch(uri);
                offchainMeta = await res.json();
            }
        }
        catch {
            // abaikan jika gagal ambil
        }
        // 5) Upsert token ke DB
        const onchainName = (metadata.name ??
            metadata.data?.name ??
            "")
            .replace(/\0/g, "")
            .trim();
        const onchainSymbol = (metadata.symbol ??
            metadata.data?.symbol ??
            "")
            .replace(/\0/g, "")
            .trim();
        const onchainUri = (metadata.uri ??
            metadata.data?.uri ??
            "")
            .replace(/\0/g, "")
            .trim();
        const nowIso = new Date().toISOString();
        const token = await upsertToken({
            collection_id: collectionId,
            token_id: mintAddress,
            owner_user_id: userId,
            minted_at: nowIso,
            metadata: offchainMeta
                ? {
                    onchain: {
                        name: onchainName,
                        symbol: onchainSymbol,
                        uri: onchainUri,
                    },
                    offchain: offchainMeta,
                }
                : {
                    onchain: {
                        name: onchainName,
                        symbol: onchainSymbol,
                        uri: onchainUri,
                    },
                },
        });
        return {
            token,
            collection: {
                id: collection.id,
                name: collection.name,
                symbol: collection.symbol,
            },
        };
    }
    static async publicListCollections() {
        const cols = await listCollections();
        const withCounts = await Promise.all(cols.map(async (c) => {
            const mintedCount = await getMintedCountByCollectionId(c.id);
            return { ...c, mintedCount };
        }));
        return withCounts;
    }
    static async publicGetCollectionDetail(collectionId) {
        const col = await getCollectionById(collectionId);
        if (!col)
            throw new Error("Collection not found");
        const mintedCount = await getMintedCountByCollectionId(collectionId);
        // optional: ambil 12 token terbaru untuk preview
        const { items } = await listTokensWithJoins({
            collectionId,
            page: 1,
            pageSize: 12,
            order: "minted_at_desc",
        });
        return {
            ...col,
            mintedCount,
            latestTokens: items,
        };
    }
    static async ownedListTokens(userId, query) {
        return await listTokensWithJoins({
            ...query,
            ownerUserId: userId,
        });
    }
    static async publicListTokens(query) {
        return await listTokensWithJoins(query);
    }
    static async listTokens(query) {
        const { items, page, pageSize, total } = await listTokensWithJoins(query);
        const hasMore = page * pageSize < total;
        return {
            items,
            page,
            pageSize,
            total,
            hasMore,
        };
    }
    /**
     * Buat collection row baru di DB (pencatatan, bukan deploy CM).
     */
    static async createCollection(input) {
        const { chainId, contractAddress, symbol, name, royaltiesBps, revenueSharePct, } = input;
        const existing = await getCollectionByContractAddress(contractAddress);
        if (existing)
            throw new Error("Collection already exists");
        const created = await insertCollection({
            chain_id: chainId ?? null,
            contract_address: contractAddress,
            symbol: symbol ?? null,
            name: name ?? null,
            royalties_bps: royaltiesBps ?? 0,
            revenue_share_pct: revenueSharePct ?? 0,
        });
        console.log(created);
        return created;
    }
}
