import { Router } from "express";
import { submitBid } from "../controllers/bidController.js";

const router = Router({ mergeParams: true });

router.post("/", submitBid);

export default router;