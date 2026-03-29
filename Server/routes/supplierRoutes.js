import { Router } from "express";
import { listSuppliers, createSupplier } from "../controllers/supplierController.js";

const router = Router();

router.get("/", listSuppliers);
router.post("/", createSupplier);

export default router;