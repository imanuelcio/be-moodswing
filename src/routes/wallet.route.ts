import { Hono } from "hono";
import { WalletController } from "../controllers/wallet.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";

const wallet = new Hono();
const walletController = new WalletController();

// All wallet endpoints require authentication
wallet.use("/*", createJwtMiddleware());

wallet.get("/", walletController.getUserWallets.bind(walletController));
wallet.get(
  "/primary",
  walletController.getPrimaryWallet.bind(walletController)
);
wallet.get("/stats", walletController.getWalletStats.bind(walletController));

wallet.post("/", walletController.addWallet.bind(walletController));
wallet.put("/:id", walletController.updateWallet.bind(walletController));
wallet.delete("/:id", walletController.deleteWallet.bind(walletController));

export { wallet };
