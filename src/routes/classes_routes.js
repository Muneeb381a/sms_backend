import express from "express";
import { createClasses, getAllClasses } from "../controllers/classes_controller.js";

const router = express.Router();

router.get('/classes', getAllClasses)
router.post('/classes', createClasses)

export default router;