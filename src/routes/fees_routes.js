import express from "express";
import {
  createVoucher,
  getVoucher,
  updatePayment,
  getStudentVouchers,
  deleteVoucher,
  generateVoucherPDF,
  createFeeVoucherDetail,
  updateFeeVoucherDetail,
  deleteFeeVoucherDetail,
} from "../controllers/fees_controllers.js";

const router = express.Router();

router.post("/", createVoucher);
router.get("/:id", getVoucher);
router.patch("/:id/payment", updatePayment);
router.get("/student/:studentId", getStudentVouchers);
router.delete("/:id", deleteVoucher);
router.get("/:id/pdf", generateVoucherPDF);
router.post("/details", createFeeVoucherDetail);
router.patch("/details/:id", updateFeeVoucherDetail);
router.delete("/details/:id", deleteFeeVoucherDetail);

export default router;
