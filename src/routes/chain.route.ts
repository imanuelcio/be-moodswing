import { Hono } from "hono";
import { ChainController } from "../controllers/chain.controller.js";
import { createAdminMiddleware } from "../middleware/auth.middleware.js";

const chain = new Hono();
const chainController = new ChainController();

// Public endpoints
chain.get("/", chainController.listChains.bind(chainController));
chain.get("/:id", chainController.getChainById.bind(chainController));
chain.get("/kind/:kind", chainController.getChainsByKind.bind(chainController));

// Admin endpoints
chain.use("/admin/*", createAdminMiddleware());
chain.post("/admin/chains", chainController.createChain.bind(chainController));
chain.put(
  "/admin/chains/:id",
  chainController.updateChain.bind(chainController)
);
chain.delete(
  "/admin/chains/:id",
  chainController.deleteChain.bind(chainController)
);

export { chain };
