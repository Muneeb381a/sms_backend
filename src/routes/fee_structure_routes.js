import express from "express";
import {
  createFeeStructure,
  deleteFeeStructure,
  getAllFeeStructures,
  getFeeStructureById,
  updateFeeStructure,
} from "../controllers/fee_structure_controllers.js";

const router = express.Router();

router.get("/", getAllFeeStructures);
router.post("/", createFeeStructure);
router.get("/:id", getFeeStructureById);
router.patch("/:id", updateFeeStructure);
router.delete("/:id", deleteFeeStructure);

export default router;
