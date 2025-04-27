import express from "express";
import { createClasses, getAllClasses, updateClasses, deleteClass, getClassById } from "../controllers/classes_controller.js";

const router = express.Router();

router.get('/classes', getAllClasses)
router.post('/classes', createClasses)
router.put('/classes/:id', updateClasses)
router.delete('/classes/:id', deleteClass);
router.get('/classes/:id', getClassById)

export default router;