import { pool } from "../config/db.js";
import logger from "../services/logger.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import upload from "../utils/multer.js";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import Joi from "joi";

// Schema version for debugging
const SCHEMA_VERSION = "1.0.6";

// Validation schema using Joi
const studentSchema = Joi.object({
  class_id: Joi.number().required(),
  section_id: Joi.number().allow(null),
  roll_number: Joi.string().required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  email: Joi.string().email().required(),
  dob: Joi.date().iso().allow(null),
  whatsapp_number: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .allow(null),
  cell_number: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .allow(null),
  address: Joi.string().allow(null),
  gender: Joi.string().valid("male", "female", "other").allow(null),
  academic_session: Joi.string().allow(null),
  admission_date: Joi.date().iso().allow(null),
  b_form_number: Joi.string()
    .pattern(/^\d{13}$/)
    .allow(null),
  city: Joi.string().allow(null),
  cnic_number: Joi.string()
    .pattern(/^\d{13}$/)
    .allow(null),
  disability: Joi.boolean().allow(null),
  district: Joi.string().allow(null),
  emergency_contact: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .allow(null),
  guardian_cnic: Joi.string()
    .pattern(/^\d{13}$/)
    .allow(null),
  guardian_name: Joi.string().allow(null),
  guardian_occupation: Joi.string().allow(null),
  guardian_relationship: Joi.string().allow(null),
  nationality: Joi.string().allow(null),
  postal_code: Joi.string().allow(null),
  previous_school: Joi.string().allow(null),
  province: Joi.string().allow(null),
  religion: Joi.string().allow(null),
  student_status: Joi.string()
    .valid("active", "inactive", "suspended")
    .allow(null),
});

// Log schema version on startup
logger.info(`Loaded student schema version: ${SCHEMA_VERSION}`);

// Middleware to handle file upload
const handleFileUpload = (req, res, next) => {
  const requestId = uuidv4();
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error: ${err.message}`, { requestId });
      return next(
        new ApiError(400, "File upload error", { details: err.message })
      );
    } else if (err) {
      logger.error(`File upload error: ${err.message}`, { requestId });
      return next(new ApiError(400, err.message));
    }
    logger.info(`File upload processed`, {
      requestId,
      files: req.files ? Object.keys(req.files) : [],
    });
    next();
  });
};

// Controller for creating a new student
const createStudent = async (req, res, next) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  logger.info("Creating new student", { requestId, body: req.body });
  const files = req.files || {};
  const { error: validationError, value: body } = studentSchema.validate(
    req.body,
    {
      abortEarly: false,
    }
  );
  if (validationError) {
    logger.error("Validation error", {
      requestId,
      details: validationError.details,
      body: req.body,
      schemaVersion: SCHEMA_VERSION,
    });
    return next(
      new ApiError(400, "Validation failed", {
        details: validationError.details,
      })
    );
  }

  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`, {
      requestId,
    });

    try {
      await client.query("BEGIN");

      // Verify class exists
      const classCheck = await client.query(
        "SELECT id FROM classes WHERE id = $1",
        [body.class_id]
      );
      if (classCheck.rows.length === 0) {
        logger.error(`Class with ID ${body.class_id} not found`, { requestId });
        throw new ApiError(404, "Class not found");
      }

      // Verify section exists if provided
      if (body.section_id) {
        const sectionCheck = await client.query(
          "SELECT id FROM sections WHERE id = $1 AND class_id = $2",
          [body.section_id, body.class_id]
        );
        if (sectionCheck.rows.length === 0) {
          logger.error(
            `Section with ID ${body.section_id} not found for class ID ${body.class_id}`,
            { requestId }
          );
          throw new ApiError(404, "Section not found");
        }
      }

      // Check for duplicate email
      const emailCheck = await client.query(
        "SELECT id FROM students WHERE email = $1",
        [body.email]
      );
      logger.info(`Email check result: ${emailCheck.rows.length} rows found`, {
        requestId,
      });
      if (emailCheck.rows.length > 0) {
        logger.error(`Student with email ${body.email} already exists`, {
          requestId,
        });
        throw new ApiError(409, "A student with this email already exists");
      }

      // Check for duplicate roll_number within class/section
      const rollNumberCheck = await client.query(
        `SELECT id FROM students WHERE class_id = $1 AND roll_number = $2 AND ($3::integer IS NULL OR section_id = $3)`,
        [body.class_id, body.roll_number, body.section_id || null]
      );
      if (rollNumberCheck.rows.length > 0) {
        logger.error(
          `Student with roll number ${body.roll_number} already exists in class ID ${body.class_id}${
            body.section_id ? ` and section ID ${body.section_id}` : ""
          }`,
          { requestId }
        );
        throw new ApiError(
          409,
          "A student with this roll number already exists in the class/section"
        );
      }

      // Upload files to Cloudinary with timeout and error handling
      let image_url = null;
      let image_public_id = null;
      let pdf_url = null;
      let pdf_public_id = null;

      const uploadPromises = [];
      const uploadTimeout = 10000; // 10s timeout per upload

      if (files.image && files.image[0]) {
        logger.info(`Processing image upload`, {
          requestId,
          fileSize: files.image[0].size,
          mimeType: files.image[0].mimetype,
        });
        uploadPromises.push(
          Promise.race([
            new Promise((resolve, reject) => {
              const stream = uploadOnCloudinary.uploader.upload_stream(
                { resource_type: "image", folder: "students/images" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(files.image[0].buffer);
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Image upload timeout")),
                uploadTimeout
              )
            ),
          ])
        );
      }
      if (files.pdf && files.pdf[0]) {
        logger.info(`Processing PDF upload`, {
          requestId,
          fileSize: files.pdf[0].size,
          mimeType: files.pdf[0].mimetype,
        });
        uploadPromises.push(
          Promise.race([
            new Promise((resolve, reject) => {
              const stream = uploadOnCloudinary.uploader.upload_stream(
                { resource_type: "raw", folder: "students/pdfs" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(files.pdf[0].buffer);
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("PDF upload timeout")),
                uploadTimeout
              )
            ),
          ])
        );
      }

      if (uploadPromises.length > 0) {
        const uploadResults = await Promise.allSettled(uploadPromises);
        uploadResults.forEach((result, index) => {
          const fileType = index === 0 ? "image" : "pdf";
          if (result.status === "fulfilled") {
            const uploadResult = result.value;
            if (fileType === "image") {
              image_url = uploadResult.secure_url;
              image_public_id = uploadResult.public_id;
              logger.info(
                `Uploaded ${fileType} to Cloudinary: ${image_public_id}`,
                { requestId }
              );
            } else {
              pdf_url = uploadResult.secure_url;
              pdf_public_id = uploadResult.public_id;
              logger.info(
                `Uploaded ${fileType} to Cloudinary: ${pdf_public_id}`,
                { requestId }
              );
            }
          } else {
            logger.error(
              `Failed to upload ${fileType}: ${result.reason.message}`,
              { requestId }
            );
            throw new ApiError(500, `Failed to upload ${fileType}`, {
              details: result.reason.message,
            });
          }
        });
      } else {
        logger.info("No files provided for upload", { requestId });
      }

      // Insert student
      const startQuery = Date.now();
      const result = await client.query(
        `INSERT INTO students (
          class_id, section_id, roll_number, first_name, last_name, email,
          dob, whatsapp_number, cell_number, address, gender,
          academic_session, admission_date, b_form_number, city,
          cnic_number, disability, district, emergency_contact,
          guardian_cnic, guardian_name, guardian_occupation,
          guardian_relationship, nationality, postal_code,
          previous_school, province, religion, student_status,
          image_url, image_public_id, pdf_url, pdf_public_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30, $31, $32, $33)
        RETURNING *`,
        [
          body.class_id,
          body.section_id || null,
          body.roll_number,
          body.first_name,
          body.last_name,
          body.email,
          body.dob || null,
          body.whatsapp_number || null,
          body.cell_number || null,
          body.address || null,
          body.gender || null,
          body.academic_session || null,
          body.admission_date || null,
          body.b_form_number || null,
          body.city || null,
          body.cnic_number || null,
          body.disability !== undefined ? body.disability : null,
          body.district || null,
          body.emergency_contact || null,
          body.guardian_cnic || null,
          body.guardian_name || null,
          body.guardian_occupation || null,
          body.guardian_relationship || null,
          body.nationality || null,
          body.postal_code || null,
          body.previous_school || null,
          body.province || null,
          body.religion || null,
          body.student_status || null,
          image_url,
          image_public_id,
          pdf_url,
          pdf_public_id,
        ]
      );
      const queryTime = Date.now() - startQuery;
      logger.info(
        `Inserted student with ID ${result.rows[0].id} in ${queryTime}ms`,
        { requestId }
      );

      await client.query("COMMIT");
      const totalTime = Date.now() - startTime;
      logger.info(`Request completed in ${totalTime}ms`, { requestId });
      return res
        .status(201)
        .json(
          new ApiResponse(201, "Student created successfully", result.rows[0])
        );
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Insert error: ${err.message}`, {
        requestId,
        stack: err.stack,
      });
      if (err.code === "23505") {
        throw new ApiError(
          409,
          "A student with this email or roll number already exists"
        );
      }
      throw new ApiError(500, "Failed to create student", {
        details: err.message,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Connection error: ${err.message}`, {
      requestId,
      stack: err.stack,
    });
    return next(new ApiError(500, "Failed to connect to database"));
  }
};

// update student

const updateStudent = async (req, res, next) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  logger.info("Updating student", {
    requestId,
    params: req.params,
    body: req.body,
  });
  const files = req.files || {};
  const studentId = req.params.id;

  const { error: validationError, value: body } = studentSchema.validate(
    req.body,
    {
      abortEarly: false,
    }
  );

  if (validationError) {
    logger.error("Validation error", {
      requestId,
      details: validationError.details,
      body: req.body,
      schemaVersion: SCHEMA_VERSION,
    });
    return next(
      new ApiError(400, "validaion failed", {
        details: validationError.details,
      })
    );
  }

  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`, {
      requestId,
    });

    try {
      await client.query("BEGIN");

      // verify student exists

      const studentCheck = await client.query(
        "SELECT id, image_public_id, pdf_public_id FROM students WHERE id = $1",
        [studentId]
      );
      if (studentCheck.rows.length === 0) {
        logger.error(`Student with ID ${studentId} not found`, { requestId });
        throw new ApiError(404, "Student not found");
      }

      // verify class exists if provided
      if (body.class_id) {
        const classCheck = await client.query(
          "SELECT id FROM classes WHERE id = $1",
          [body.class_id]
        );
        if (classCheck.rows.length === 0) {
          logger.error(`Class with ID ${body.class_id} not found`, {
            requestId,
          });
          throw new ApiError(404, "Class not found");
        }
      }

      // verify section exists if provided
      if (body.section_id) {
        const sectionCheck = await client.query(
          "SELECT id FROM sections WHERE id = $1 AND class_id = $2",
          [body.section_id, body.class_id]
        );
        if (sectionCheck.rows.length === 0) {
          logger.error(
            `Section with id ${section_id} not found for class ID ${body.class_id}`,
            { requestId }
          );
          throw new ApiError(404, "Section not found");
        }
      }

      // check for duplicates email (excluding current student)

      if (body.email) {
        const emailCheck = await client.query(
          "SELECT id FROM students WHERE email = $1 AND id != $2",
          [body.email, studentId]
        );
        logger.info(
          `Email check result: ${emailCheck.rows.length} rows found`,
          {
            requestId,
          }
        );
        if (emailCheck.rows.length > 0) {
          logger.error(`Student with email ${body.email} already exists`, {
            requestId,
          });
          throw new ApiError(409, "A student with this email already exists");
        }
      }

      // check for duplicates roll_number with in class/section (excluding current student)

      if (body.roll_number && body.class_id) {
        const rollNumberCheck = await client.query(
          `SELECT id FROM students WHERE class_id = $1 AND roll_number = $2 AND ($3::integer IS NULL OR section_id = $3) AND id != $4`,
          [body.class_id, body_roll_number, body.section_id || null, studentId]
        );
        if (rollNumberCheck.rows.length > 0) {
          logger.error(
            `Student with roll number ${body.roll_number} already exists in class ID ${body.class_id}${
              body.section_id ? `and section ID ${body.section_id}` : ""
            }`,
            { requestId }
          );
          throw new ApiError(
            409,
            "A Student with this roll number already exists in class/section"
          );
        }
      }

      // Handle file uploads to Cloudinary
      let image_url = studentCheck.rows[0].image_url;
      let image_public_id = studentCheck.rows[0].image_public_id;
      let pdf_url = studentCheck.rows[0].pdf_url;
      let pdf_public_id = studentCheck.rows[0].pdf_public_id;

      const uploadPromises = [];
      const uploadTimeout = 10000; // 10s timeout per upload

      if (files.image && files.image[0]) {
        logger.info(`Processing image upload`, {
          requestId,
          fileSize: files.image[0].size,
          mimeType: files.image[0].mimetype,
        });
        // Delete existing image if present
        if (image_public_id) {
          await uploadOnCloudinary.uploader.destroy(image_public_id);
          logger.info(`Deleted existing image: ${image_public_id}`, {
            requestId,
          });
        }
        uploadPromises.push(
          Promise.race([
            new Promise((resolve, reject) => {
              const stream = uploadOnCloudinary.uploader.upload_stream(
                { resource_type: "image", folder: "students/images" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(files.image[0].buffer);
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Image upload timeout")),
                uploadTimeout
              )
            ),
          ])
        );
      }
      if (files.pdf && files.pdf[0]) {
        logger.info(`Processing PDF upload`, {
          requestId,
          fileSize: files.pdf[0].size,
          mimeType: files.pdf[0].mimetype,
        });
        // Delete existing PDF if present
        if (pdf_public_id) {
          await uploadOnCloudinary.uploader.destroy(pdf_public_id);
          logger.info(`Deleted existing PDF: ${pdf_public_id}`, { requestId });
        }
        uploadPromises.push(
          Promise.race([
            new Promise((resolve, reject) => {
              const stream = uploadOnCloudinary.uploader.upload_stream(
                { resource_type: "raw", folder: "students/pdfs" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(files.pdf[0].buffer);
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("PDF upload timeout")),
                uploadTimeout
              )
            ),
          ])
        );
      }

      if (uploadPromises.length > 0) {
        const uploadResults = await Promise.allSettled(uploadPromises);
        uploadResults.forEach((result, index) => {
          const fileType = index === 0 ? "image" : "pdf";
          if (result.status === "fulfilled") {
            const uploadResult = result.value;
            if (fileType === "image") {
              image_url = uploadResult.secure_url;
              image_public_id = uploadResult.public_id;
              logger.info(
                `Uploaded ${fileType} to Cloudinary: ${image_public_id}`,
                { requestId }
              );
            } else {
              pdf_url = uploadResult.secure_url;
              pdf_public_id = uploadResult.public_id;
              logger.info(
                `Uploaded ${fileType} to Cloudinary: ${pdf_public_id}`,
                { requestId }
              );
            }
          } else {
            logger.error(
              `Failed to upload ${fileType}: ${result.reason.message}`,
              { requestId }
            );
            throw new ApiError(500, `Failed to upload ${fileType}`, {
              details: result.reason.message,
            });
          }
        });
      } else {
        logger.info("No new files provided for upload", { requestId });
      }
      // Update student
      const startQuery = Date.now();
      const result = await client.query(
        `UPDATE students SET
    class_id = COALESCE($1, class_id),
    section_id = $2,
    roll_number = COALESCE($3, roll_number),
    first_name = COALESCE($4, first_name),
    last_name = COALESCE($5, last_name),
    email = COALESCE($6, email),
    dob = $7,
    whatsapp_number = $8,
    cell_number = $9,
    address = $10,
    gender = $11,
    academic_session = $12,
    admission_date = $13,
    b_form_number = $14,
    city = $15,
    cnic_number = $16,
    disability = $17,
    district = $18,
    emergency_contact = $19,
    guardian_cnic = $20,
    guardian_name = $21,
    guardian_occupation = $22,
    guardian_relationship = $23,
    nationality = $24,
    postal_code = $25,
    previous_school = $26,
    province = $27,
    religion = $28,
    student_status = $29,
    image_url = $30,
    image_public_id = $31,
    pdf_url = $32,
    pdf_public_id = $33,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = $34
  RETURNING *`,
        [
          body.class_id || null,
          body.section_id || null,
          body.roll_number || null,
          body.first_name || null,
          body.last_name || null,
          body.email || null,
          body.dob || null,
          body.whatsapp_number || null,
          body.cell_number || null,
          body.address || null,
          body.gender || null,
          body.academic_session || null,
          body.admission_date || null,
          body.b_form_number || null,
          body.city || null,
          body.cnic_number || null,
          body.disability !== undefined ? body.disability : null,
          body.district || null,
          body.emergency_contact || null,
          body.guardian_cnic || null,
          body.guardian_name || null,
          body.guardian_occupation || null,
          body.guardian_relationship || null,
          body.nationality || null,
          body.postal_code || null,
          body.previous_school || null,
          body.province || null,
          body.religion || null,
          body.student_status || null,
          image_url,
          image_public_id,
          pdf_url,
          pdf_public_id,
          studentId,
        ]
      );
      const queryTime = Date.now() - startQuery;
      logger.info(`Updated student with ID ${studentId} in ${queryTime}ms`, {
        requestId,
      });

      await client.query("COMMIT");
      const totalTime = Date.now() - startTime;
      logger.info(`Request completed in ${totalTime}ms`, { requestId });
      return res
        .status(200)
        .json(
          new ApiResponse(200, "Student updated successfully", result.rows[0])
        );
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Update error: ${err.message}`, {
        requestId,
        stack: err.stack,
      });
      if (err.code === "23505") {
        throw new ApiError(
          409,
          "A student with this email or roll number already exists"
        );
      }
      throw err instanceof ApiError
        ? err
        : new ApiError(500, "Failed to update student", {
            details: err.message,
          });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Connection error: ${err.message}`, {
      requestId,
      stack: err.stack,
    });
    return next(new ApiError(500, "Failed to connect to database"));
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

export { createStudent, handleFileUpload, getAllStudents, updateStudent };
