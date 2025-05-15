import express from "express";
import { createDiary } from "../controllers/diaries_controller.js";

const router = express.Router();

router.post("/", createDiary);


export default router