import express from "express";
import { getAllClasses } from "../controllers/classes_controller.js";

const router = express.Router();

router.get('/classes', getAllClasses)

export default router;