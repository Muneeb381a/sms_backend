import express from "express";
import { createDiary, deleteDiary, getDiariesByClass, updateDiary } from "../controllers/diaries_controller.js";

const router = express.Router();

router.post("/", createDiary);
router.get("/:class_id", getDiariesByClass);
router.put("/:id", updateDiary);
router.delete("/:id", deleteDiary);


export default router