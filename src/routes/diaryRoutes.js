import express from "express";
import { createDiary, getDiariesByClass } from "../controllers/diaries_controller.js";

const router = express.Router();

router.post("/", createDiary);
router.get("/:class_id", getDiariesByClass);


export default router