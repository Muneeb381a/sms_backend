import { pool } from "../config/db.js";
import logger from "../services/logger.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import upload from "../utils/multer.js";
import multer from "multer";

// Middleware to handle file upload
const handleFileUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error: ${err.message}`);
      const error = new Error("File upload error");
      error.status = 400;
      return next(error);
    } else if (err) {
      logger.error(`File upload error: ${err.message}`);
      const error = new Error(err.message);
      error.status = 400;
      return next(error);
    }
    next();
  });
};

// Controller for creating a new student
const createStudent = async (req, res, next) => {
  const {
    class_id,
    section_id,
    roll_number,
    first_name,
    last_name,
    email,
    dob,
    whatsapp_number,
    cell_number,
    address,
    gender,
    academic_session,
    admission_date,
    b_form_number,
    city,
    cnic_number,
    disability,
    district,
    emergency_contact,
    guardian_cnic,
    guardian_name,
    guardian_occupation,
    guardian_relationship,
    nationality,
    postal_code,
    previous_school,
    province,
    religion,
    student_status,
  } = req.body;
  const files = req.files || {};

  // Validate required fields
  if (!class_id || !first_name || !last_name || !email) {
    logger.error("Class ID, first name, last name, and email are required");
    const error = new Error(
      "Class ID, first name, last name, and email are required"
    );
    error.status = 400;
    return next(error);
  }

  // Validate optional fields
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    logger.error("Invalid date of birth format. Use YYYY-MM-DD");
    const error = new Error("Invalid date of birth format. Use YYYY-MM-DD");
    error.status = 400;
    return next(error);
  }
  if (admission_date && !/^\d{4}-\d{2}-\d{2}$/.test(admission_date)) {
    logger.error("Invalid admission date format. Use YYYY-MM-DD");
    const error = new Error("Invalid admission date format. Use YYYY-MM-DD");
    error.status = 400;
    return next(error);
  }
  if (whatsapp_number && !/^\+?[1-9]\d{1,14}$/.test(whatsapp_number)) {
    logger.error("Invalid WhatsApp number format");
    const error = new Error("Invalid WhatsApp number format");
    error.status = 400;
    return next(error);
  }
  if (cell_number && !/^\+?[1-9]\d{1,14}$/.test(cell_number)) {
    logger.error("Invalid cell number format");
    const error = new Error("Invalid cell number format");
    error.status = 400;
    return next(error);
  }
  if (emergency_contact && !/^\+?[1-9]\d{1,14}$/.test(emergency_contact)) {
    logger.error("Invalid emergency contact number format");
    const error = new Error("Invalid emergency contact number format");
    error.status = 400;
    return next(error);
  }
  if (gender && !["male", "female", "other"].includes(gender.toLowerCase())) {
    logger.error("Invalid gender. Must be 'male', 'female', or 'other'");
    const error = new Error(
      "Invalid gender. Must be 'male', 'female', or 'other'"
    );
    error.status = 400;
    return next(error);
  }
  if (
    student_status &&
    !["active", "inactive", "suspended"].includes(student_status.toLowerCase())
  ) {
    logger.error(
      "Invalid student status. Must be 'active', 'inactive', or 'suspended'"
    );
    const error = new Error(
      "Invalid student status. Must be 'active', 'inactive', or 'suspended'"
    );
    error.status = 400;
    return next(error);
  }
  if (cnic_number && !/^\d{13}$/.test(cnic_number)) {
    logger.error("Invalid CNIC number format. Must be 13 digits");
    const error = new Error("Invalid CNIC number format. Must be 13 digits");
    error.status = 400;
    return next(error);
  }
  if (guardian_cnic && !/^\d{13}$/.test(guardian_cnic)) {
    logger.error("Invalid guardian CNIC number format. Must be 13 digits");
    const error = new Error(
      "Invalid guardian CNIC number format. Must be 13 digits"
    );
    error.status = 400;
    return next(error);
  }
  if (b_form_number && !/^\d{13}$/.test(b_form_number)) {
    logger.error("Invalid B-Form number format. Must be 13 digits");
    const error = new Error("Invalid B-Form number format. Must be 13 digits");
    error.status = 400;
    return next(error);
  }
  
  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    try {
      await client.query("BEGIN");

      // Verify class exists
      const classCheck = await client.query(
        "SELECT id FROM classes WHERE id = $1",
        [class_id]
      );
      if (classCheck.rows.length === 0) {
        logger.error(`Class with ID ${class_id} not found`);
        const error = new Error("Class not found");
        error.status = 404;
        return next(error);
      }

      // Verify section exists if provided
      if (section_id) {
        const sectionCheck = await client.query(
          "SELECT id FROM sections WHERE id = $1 AND class_id = $2",
          [section_id, class_id]
        );
        if (sectionCheck.rows.length === 0) {
          logger.error(
            `Section with ID ${section_id} not found for class ID ${class_id}`
          );
          const error = new Error("Section not found");
          error.status = 404;
          return next(error);
        }
      }

      // Check for duplicate email
      const emailCheck = await client.query(
        "SELECT id FROM students WHERE email = $1",
        [email]
      );
      if (emailCheck.rows.length > 0) {
        logger.error(`Student with email ${email} already exists`);
        const error = new Error("A student with this email already exists");
        error.status = 409;
        return next(error);
      }

      // Check for duplicate roll_number within class/section
      const rollNumberCheck = await client.query(
        `SELECT id FROM students WHERE class_id = $1 AND roll_number = $2 AND ($3::integer IS NULL OR section_id = $3)`,
        [class_id, roll_number, section_id || null]
      );
      if (rollNumberCheck.rows.length > 0) {
        logger.error(
          `Student with roll number ${roll_number} already exists in class ID ${class_id}${
            section_id ? ` and section ID ${section_id}` : ""
          }`
        );
        const error = new Error(
          "A student with this roll number already exists in the class/section"
        );
        error.status = 409;
        return next(error);
      }

      // Upload image to Cloudinary if provided
      let image_url = null;
      let image_public_id = null;
      if (files.image && files.image[0]) {
        const imageResult = await new Promise((resolve, reject) => {
          const stream = uploadOnCloudinary.uploader.upload_stream(
            { resource_type: "image", folder: "students/images" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(files.image[0].buffer);
        });
        image_url = imageResult.secure_url;
        image_public_id = imageResult.public_id;
        logger.info(`Uploaded image to Cloudinary: ${image_public_id}`);
      }

      // Upload PDF to Cloudinary if provided
      let pdf_url = null;
      let pdf_public_id = null;
      if (files.pdf && files.pdf[0]) {
        const pdfResult = await new Promise((resolve, reject) => {
          const stream = uploadOnCloudinary.uploader.upload_stream(
            { resource_type: "raw", folder: "students/pdfs" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(files.pdf[0].buffer);
        });
        pdf_url = pdfResult.secure_url;
        pdf_public_id = pdfResult.public_id;
        logger.info(`Uploaded PDF to Cloudinary: ${pdf_public_id}`);
      }

      // Insert student
      const startQuery = Date.now();
      const result = await client.query(
        `INSERT INTO students(class_id, section_id, roll_number, first_name, last_name, email,
          dob, whatsapp_number, cell_number, address, gender,
          academic_session, admission_date, b_form_number, city,
          cnic_number, disability, district, emergency_contact,
          guardian_cnic, guardian_name, guardian_occupation,
          guardian_relationship, nationality, postal_code,
          previous_school, province, religion, student_status,
          image_url, image_public_id, pdf_url, pdf_public_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
         RETURNING *`,
        [
          class_id,
          section_id || null,
          roll_number,
          first_name,
          last_name,
          email,
          dob || null,
          whatsapp_number || null,
          cell_number || null,
          address || null,
          gender ? gender.toLowerCase() : null,
          academic_session || null,
          admission_date || null,
          b_form_number || null,
          city || null,
          cnic_number || null,
          disability !== undefined ? disability : null,
          district || null,
          emergency_contact || null,
          guardian_cnic || null,
          guardian_name || null,
          guardian_occupation || null,
          guardian_relationship || null,
          nationality || null,
          postal_code || null,
          previous_school || null,
          province || null,
          religion || null, 
          student_status ? student_status.toLowerCase() : null,
          image_url,
          image_public_id,
          pdf_url,
          pdf_public_id,
        ]
      );
      const queryTime = Date.now() - startQuery;
      logger.info(
        `Inserted student with ID ${result.rows[0].id} in ${queryTime}ms`
      );

      await client.query("COMMIT");
      res.status(201).json({
        status: "success",
        message: "Student created successfully",
        data: result.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Insert error: ${err.stack}`);
      if (err.code === "23505") {
        const error = new Error("A student with this email already exists");
        error.status = 409;
        return next(error);
      }
      const error = new Error("Failed to create student");
      error.status = 500;
      next(error);
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Connection error: ${err.stack}`);
    const error = new Error("Failed to connect to database");
    error.status = 500;
    next(err);
  }
};

// get all students

const getAllStudents = async (req, res, next) => {
  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database conection in ${connectionTime}ms`);

    try {
      const startQuery = Date.now();
      const result = await client.query(`
        SELECT 
          s.id,
          s.class_id,
          s.section_id,
          s.first_name,
          s.last_name,
          s.email,
          s.dob,
          s.whatsapp_number,
          s.cell_number,
          s.address,
          s.gender,
          s.academic_session,
          s.admission_date,
          s.b_form_number,
          s.city,
          s.cnic_number,
          s.disability,
          s.district,
          s.emergency_contact,
          s.guardian_cnic,
          s.guardian_name,
          s.guardian_occupation,
          s.guardian_relationship,
          s.nationality,
          s.postal_code,
          s.previous_school,
          s.province,
          s.religion,
          s.student_status,
          s.image_url,
          s.pdf_url,
          s.created_at,
          s.updated_at,
          c.class_name,
          sec.section_name
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN sections sec ON s.section_id = sec.id
        ORDER BY s.created_at DESC
      `);
      const queryTime = Date.now() - startQuery;
      logger.info(
        `Query excuted in ${queryTime}ms, retrived ${result.rows.length} students`
      );

      if (result.rows.length === 0) {
        return res.status(200).json({
          status: "success",
          message: "No student found",
          data: [],
        });
      }

      res.status(200).json({
        status: "Success",
        message: "Students retrived successfully",
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`Error fething students: ${error.stack}`);
    const err = new Error("Failed to fetch students");
    err.status = 500;
    next(err);
  }
};

export { createStudent, handleFileUpload, getAllStudents };
