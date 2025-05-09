import express from "express";
import { body, param, query } from "express-validator";
import {
  createAttendance,
  deleteAttendance,
  getAllAttendance,
  getClassAttendance,
  getTodaysAttendance,
  markClassAttendance,
  updateAttendance,
} from "../controllers/attendance_controllers.js";

const router = express.Router();

// Validation middleware
const dateValidator = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date format, use YYYY-MM-DD");
  }
  if (isNaN(Date.parse(value))) {
    throw new Error("Invalid date");
  }
  return true;
};

// Create a single attendance record
router.post(
  "/",
  [
    body("student_id").isInt().withMessage("Student ID must be an integer"),
    body("class_id").isInt().withMessage("Class ID must be an integer"),
    body("attendance_date").custom(dateValidator),
    body("status")
      .isIn(["present", "absent"])
      .withMessage("Status must be 'present' or 'absent'"),
  ],
  createAttendance
);

// Mark attendance for a class
router.post(
  "/class",
  [
    body("class_id").isInt().withMessage("Class ID must be an integer"),
    body("attendance_date").custom(dateValidator),
    body("attendance_records")
      .isArray()
      .withMessage("attendance_records must be an array"),
    body("attendance_records.*.student_id")
      .isInt()
      .withMessage("Student ID must be an integer"),
    body("attendance_records.*.status")
      .isIn(["present", "absent"])
      .withMessage("Status must be 'present' or 'absent'"),
  ],
  markClassAttendance
);

// Get all attendance records
router.get(
  "/",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  ],
  getAllAttendance
);

// Get attendance for a class on a specific date
router.get(
  "/class/:class_id/:attendance_date",
  [
    param("class_id").isInt().withMessage("Class ID must be an integer"),
    param("attendance_date").custom(dateValidator),
  ],
  getClassAttendance
);

// Update attendance record
router.patch(
  "/:id",
  [
    param("id").isInt().withMessage("ID must be an integer"),
    body("status")
      .isIn(["present", "absent"])
      .withMessage("Status must be 'present' or 'absent'"),
  ],
  updateAttendance
);

// Delete attendance record
router.delete(
  "/:id",
  [param("id").isInt().withMessage("ID must be an integer")],
  deleteAttendance
);

router.get(
  "/today",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  ],
  getTodaysAttendance
);

export default router;
