import express from "express";
import {
  createFeeVoucherDetail,
  getAllFeeVoucherDetails,
  getFeeVoucherDetailById,
  updateFeeVoucherDetail,
  deleteFeeVoucherDetail,
} from "../controllers/fee_voucher_details_controllers.js";

const router = express.Router();

router.get("/", getAllFeeVoucherDetails);
router.get("/:id", getFeeVoucherDetailById);
router.post("/", createFeeVoucherDetail);
router.put("/:id", updateFeeVoucherDetail);
router.delete("/:id", deleteFeeVoucherDetail);

export default router;
