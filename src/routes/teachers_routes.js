import express from "express";
import { getAllteachers, getTeacherById } from "../controllers/teachers_controller.js";

const router = express.Router()

router.get("/", getAllteachers);
router.get("/:id", getTeacherById);

export default router