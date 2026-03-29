import { Router } from "express";
import { listRfqs, getRfq, createRfq } from "../controllers/rfqController.js";

const router = Router();

router.get("/", listRfqs);
router.get("/:id", getRfq);
router.post("/", createRfq);

export default router;