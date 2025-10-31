import { Hono } from "hono";
import { NftController, NftOwnedController, } from "../controllers/nft.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";
export const nftRoutes = new Hono();
const pub = new Hono();
pub.get("/collections", NftController.listCollections);
pub.get("/collections/:id", NftController.getCollection);
pub.get("/tokens", NftController.listTokens);
nftRoutes.route("/public", pub);
// nftRoutes.use("/*", createJwtMiddleware());
const me = new Hono();
me.get("/tokens", NftOwnedController.listMyTokens);
nftRoutes.route("/me", me);
nftRoutes.post("/mint", NftController.recordMint);
nftRoutes.post("/collections", NftController.createCollection);
//  tambahan nanti:
// nftRoutes.get("/collections/:id", NftController.getCollection)
// nftRoutes.get("/me/tokens", NftController.listMyTokens)
