import express from "express";
import { createStudent, getAllStudents, handleFileUpload, updateStudent, updateStudentStatus } from "../controllers/students_controller.js";
import multer from "multer";


const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
    },
  });
const router = express.Router();

router.get("/students", getAllStudents);
router.post("/students", handleFileUpload, createStudent);
router.put("/students/:id",
    upload.fields([{name: "image", maxCount: 1}, {name: "pdf", maxCount: 1}]),
    updateStudent
)
router.patch("/students/:id/status", updateStudentStatus)

export default router;