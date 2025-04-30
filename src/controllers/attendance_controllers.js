import { pool } from "../config/db.js";
import { validationResult } from "express-validator";
import logger from "../services/logger.js";

// Create a single attendance record
export const createAttendance = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { student_id, class_id, attendance_date, status } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      INSERT INTO attendance (student_id, class_id, attendance_date, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [student_id, class_id, attendance_date, status]
    );

    await client.query("COMMIT");
    logger.info(
      `Attendance created for student_id: ${student_id}, date: ${attendance_date}`
    );
    res.status(201).json({
      data: result.rows[0],
      message: "Attendance record created successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(400).json({
        error: "Attendance record already exists for this student and date",
      });
    }
    if (error.code === "23503") {
      return res.status(400).json({ error: "Invalid student_id or class_id" });
    }
    logger.error("Error creating attendance:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Mark attendance for all students in a class
export const markClassAttendance = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { class_id, attendance_date, attendance_records } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validate class_id
    const classCheck = await client.query(
      "SELECT id FROM classes WHERE id = $1",
      [class_id]
    );
    if (classCheck.rows.length === 0) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Get students in the class
    const students = await client.query(
      "SELECT id FROM students WHERE class_id = $1",
      [class_id]
    );
    const studentIds = students.rows.map((s) => s.id);

    // Validate attendance_records
    if (!Array.isArray(attendance_records)) {
      return res
        .status(400)
        .json({ error: "attendance_records must be an array" });
    }

    const invalidRecords = attendance_records.filter(
      (record) =>
        !studentIds.includes(record.student_id) ||
        !["present", "absent"].includes(record.status)
    );
    if (invalidRecords.length > 0) {
      return res
        .status(400)
        .json({ error: "Invalid student_id or status in attendance_records" });
    }

    // Check for existing records
    const existingRecords = await client.query(
      `
      SELECT student_id
      FROM attendance
      WHERE class_id = $1 AND attendance_date = $2
      `,
      [class_id, attendance_date]
    );
    const existingStudentIds = existingRecords.rows.map((r) => r.student_id);

    if (existingStudentIds.length > 0) {
      return res.status(400).json({
        error: `Attendance already marked for students: ${existingStudentIds.join(", ")}`,
      });
    }

    // Insert attendance records
    const insertedRecords = [];
    for (const record of attendance_records) {
      const result = await client.query(
        `
        INSERT INTO attendance (student_id, class_id, attendance_date, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [record.student_id, class_id, attendance_date, record.status]
      );
      insertedRecords.push(result.rows[0]);
    }

    await client.query("COMMIT");
    logger.info(
      `Attendance marked for class_id: ${class_id}, date: ${attendance_date}`
    );
    res.status(201).json({
      data: insertedRecords,
      message: "Class attendance marked successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error marking class attendance:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get all attendance records
export const getAllAttendance = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `
        SELECT a.*, s.first_name, s.last_name, c.class_name AS class_name
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        JOIN classes c ON a.class_id = c.id
        ORDER BY a.attendance_date DESC
        LIMIT $1 OFFSET $2
        `,
      [limit, offset]
    );

    const totalResult = await pool.query(
      "SELECT COUNT(*) AS total FROM attendance"
    );

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].total),
      },
      message: "Attendance records retrieved successfully",
    });
  } catch (error) {
    logger.error("Error fetching attendance records:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// Get attendance by class and date
export const getClassAttendance = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { class_id, attendance_date } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT a.*, s.first_name, s.last_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE a.class_id = $1 AND a.attendance_date = $2
      ORDER BY s.first_name
      `,
      [class_id, attendance_date]
    );

    res.json({
      data: result.rows,
      message: "Class attendance retrieved successfully",
    });
  } catch (error) {
    logger.error("Error fetching class attendance:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update attendance record
export const updateAttendance = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { status } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE attendance
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendance record not found" });
    }

    await client.query("COMMIT");
    logger.info(`Attendance updated for id: ${id}`);
    res.status(200).json({
      data: result.rows[0],
      message: "Attendance record updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error updating attendance:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Delete attendance record
export const deleteAttendance = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      DELETE FROM attendance
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendance record not found" });
    }

    await client.query("COMMIT");
    logger.info(`Attendance deleted for id: ${id}`);
    res.json({ message: "Attendance record deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error deleting attendance:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};
