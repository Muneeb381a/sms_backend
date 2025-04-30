import express from "express";
import { generateBulkVoucherPDF, generateMonthlyFees } from "../controllers/feeGenerationControllers.js";


const router = express.Router();

router.post("/fees/generate-monthly", generateMonthlyFees);
router.get("/fees/vouchers/bulk-pdf", generateBulkVoucherPDF);

export default router;