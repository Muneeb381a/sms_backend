import express from "express";
import { createStudent, getAllStudents, handleFileUpload } from "../controllers/students_controller.js";

const router = express.Router();

router.get("/students", getAllStudents);
router.post("/students", handleFileUpload, createStudent);

export default router;