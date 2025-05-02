import express from "express";
import { createTeacher, getAllteachers, getTeacherById } from "../controllers/teachers_controller.js";

const router = express.Router()

router.get("/", getAllteachers);
router.get("/:id", getTeacherById);
router.post("/", createTeacher)

export default router