import { pool } from "../config/db.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import logger from "../services/logger.js";
import upload from "../utils/multer.js";
import multer from "multer";

async function getAllteachers(req, res) {
  let client;

  try {
    client = await pool.connect();
    const query = "SELECT * FROM teachers ORDER BY created_at DESC;";
    const result = await client.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Failed to retrieve teachers",
      details: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function getTeacherById(req, res) {
  let client;
  const { id } = req.params;
  const query = "SELECT * FROM teachers WHERE teacher_id = $1;";
  const values = [id];

  try {
    client = await pool.connect();
    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      error: "Failed to retrieve teacher",
      details: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Validate email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Validate phone format (basic check for digits and optional +)
const isValidPhone = (phone) => /^\+?\d{7,15}$/.test(phone);

// Validate date format (YYYY-MM-DD)
const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);

// Create a new teacher
export const createTeacher = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error during teacher creation: ${err.message}`, {
        err,
        files: req.files,
        body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        headers: req.headers,
        contentType: req.get("content-type"),
        boundary: req.get("content-type")?.match(/boundary=(.+)/)?.[1],
      });
      const error = new ApiError(
        400,
        err.code === "LIMIT_UNEXPECTED_FILE"
          ? `Unexpected file field: ${err.field}. In Postman: 1) Go to Body > form-data; 2) Use key "image" (Type: File) for JPEG/PNG photo; 3) Use key "pdf" (Type: File) for PDF resume; 4) Remove any "photo_url" or "resume_url" file fields.`
          : `Multer error: ${err.message}`
      );
      return next(error);
    } else if (err) {
      logger.error(
        `File upload error during teacher creation: ${err.message}`,
        {
          err,
          files: req.files,
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
          headers: req.headers,
          contentType: req.get("content-type"),
          boundary: req.get("content-type")?.match(/boundary=(.+)/)?.[1],
        }
      );
      const error = new ApiError(400, err.message);
      return next(error);
    }

    try {
      const {
        teacher_id,
        first_name,
        last_name,
        father_name,
        email,
        hire_date,
        employment_status,
        phone,
        address_line1,
        address_line2,
        city,
        postal_code,
        country,
        date_of_birth,
        years_of_experience,
        linkedin_url,
        emergency_contact_name,
        emergency_contact_phone,
        blood_group,
        gender,
        marital_status,
        nationality,
        teaching_license_number,
        educations,
        subjects_taught,
        cnic,
      } = req.body;

      // Validate required fields
      const requiredFields = {
        teacher_id,
        first_name,
        last_name,
        father_name,
        email,
        hire_date,
        employment_status,
      };
      const missingFields = Object.keys(requiredFields).filter(
        (key) => !requiredFields[key]
      );
      if (missingFields.length > 0) {
        logger.error(`Missing required fields: ${missingFields.join(", ")}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(
          400,
          `Missing required fields: ${missingFields.join(", ")}`
        );
        return next(error);
      }

      // Validate JSON fields
      let validatedEducations = educations || "[]";
      let validatedSubjectsTaught = subjects_taught || "[]";
      let subjectsArray = [];
      try {
        JSON.parse(validatedEducations); // Ensure valid JSON for educations
        subjectsArray = JSON.parse(validatedSubjectsTaught); // Parse subjects_taught
        if (
          !Array.isArray(subjectsArray) ||
          !subjectsArray.every((s) => typeof s === "string")
        ) {
          throw new Error("subjects_taught must be an array of strings");
        }
      } catch (err) {
        logger.error(
          `Invalid JSON format for educations or subjects_taught: ${err.message}`,
          {
            body: { ...req.body, cnic: "****", email: "****", phone: "****" },
          }
        );
        const error = new ApiError(
          400,
          "Invalid JSON format for educations or subjects_taught (subjects_taught must be an array of strings)"
        );
        return next(error);
      }

      // Convert subjects_taught to PostgreSQL text[] format
      const subjectsArrayLiteral = `{${subjectsArray.map((s) => `"${s.replace(/"/g, '""')}"`).join(",")}}`;

      // Validate field formats
      if (!isValidEmail(email)) {
        logger.error(`Invalid email format: ****`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid email format");
        return next(error);
      }
      if (phone && !isValidPhone(phone)) {
        logger.error(`Invalid phone format: ****`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid phone format");
        return next(error);
      }
      if (date_of_birth && !isValidDate(date_of_birth)) {
        logger.error(
          `Invalid date_of_birth format: ${date_of_birth}. Expected YYYY-MM-DD (e.g., 1996-07-27)`,
          { body: { ...req.body, cnic: "****", email: "****", phone: "****" } }
        );
        const error = new ApiError(
          400,
          "Invalid date_of_birth format (use YYYY-MM-DD, e.g., 1996-07-27)"
        );
        return next(error);
      }
      if (!isValidDate(hire_date)) {
        logger.error(
          `Invalid hire_date format: ${hire_date}. Expected YYYY-MM-DD (e.g., 2020-10-20)`,
          { body: { ...req.body, cnic: "****", email: "****", phone: "****" } }
        );
        const error = new ApiError(
          400,
          "Invalid hire_date format (use YYYY-MM-DD, e.g., 2020-10-20)"
        );
        return next(error);
      }
      if (
        years_of_experience &&
        (isNaN(years_of_experience) || years_of_experience < 0)
      ) {
        logger.error(`Invalid years_of_experience: ${years_of_experience}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(
          400,
          "Years of experience must be a non-negative number"
        );
        return next(error);
      }
      if (
        !["Full-Time", "Part-Time", "Contract", "Retired", "Resigned"].includes(
          employment_status
        )
      ) {
        logger.error(`Invalid employment_status: ${employment_status}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid employment status");
        return next(error);
      }
      if (emergency_contact_phone && !isValidPhone(emergency_contact_phone)) {
        logger.error(`Invalid emergency_contact_phone format: ****`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(
          400,
          "Invalid emergency contact phone format"
        );
        return next(error);
      }
      if (cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
        logger.error(`Invalid CNIC number format: ****`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(
          400,
          "Invalid CNIC number format (must be XXXXX-XXXXXXX-X)"
        );
        return next(error);
      }
      if (
        linkedin_url &&
        !/^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+$/.test(
          linkedin_url
        )
      ) {
        logger.error(`Invalid linkedin_url format: ${linkedin_url}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid LinkedIn URL format");
        return next(error);
      }
      if (
        blood_group &&
        !["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(
          blood_group
        )
      ) {
        logger.error(`Invalid blood_group: ${blood_group}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid blood group");
        return next(error);
      }
      if (gender && !["Male", "Female", "Other"].includes(gender)) {
        logger.error(`Invalid gender: ${gender}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid gender");
        return next(error);
      }
      if (
        marital_status &&
        !["Single", "Married", "Divorced", "Widowed"].includes(marital_status)
      ) {
        logger.error(`Invalid marital_status: ${marital_status}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Invalid marital status");
        return next(error);
      }

      // Validate file mimetypes
      if (
        req.files.image &&
        !["image/jpeg", "image/png"].includes(req.files.image[0].mimetype)
      ) {
        logger.error(
          `Invalid image file type: ${req.files.image[0].mimetype}`,
          {
            body: { ...req.body, cnic: "****", email: "****", phone: "****" },
          }
        );
        const error = new ApiError(400, "Photo must be JPEG or PNG");
        return next(error);
      }
      if (req.files.pdf && req.files.pdf[0].mimetype !== "application/pdf") {
        logger.error(`Invalid PDF file type: ${req.files.pdf[0].mimetype}`, {
          body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        });
        const error = new ApiError(400, "Resume must be a PDF");
        return next(error);
      }

      logger.info(`Creating teacher with ID: ${teacher_id}`, {
        files: req.files,
        body: { ...req.body, cnic: "****", email: "****", phone: "****" },
      });

      let photo_url = null;
      let resume_url = null;

      // Handle image upload (for photo)
      if (req.files && req.files.image) {
        const image = req.files.image[0];
        const result = await new Promise((resolve, reject) => {
          const stream = uploadOnCloudinary.uploader.upload_stream(
            { resource_type: "image", folder: "teachers/photos" },
            (error, result) => {
              if (error) reject(new ApiError(500, "Image upload failed"));
              resolve(result);
            }
          );
          stream.end(image.buffer);
        });
        photo_url = result.secure_url;
        logger.info(`Uploaded teacher photo for ID: ${teacher_id}`);
      }

      // Handle pdf upload (for resume)
      if (req.files && req.files.pdf) {
        const pdf = req.files.pdf[0];
        const result = await new Promise((resolve, reject) => {
          const stream = uploadOnCloudinary.uploader.upload_stream(
            { resource_type: "raw", folder: "teachers/resumes" },
            (error, result) => {
              if (error) reject(new ApiError(500, "PDF upload failed"));
              resolve(result);
            }
          );
          stream.end(pdf.buffer);
        });
        resume_url = result.secure_url;
        logger.info(`Uploaded teacher resume for ID: ${teacher_id}`);
      }

      const startConnection = Date.now();
      let client;
      try {
        client = await Promise.race([
          pool.connect(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Database connection timeout")),
              5000
            )
          ),
        ]);
      } catch (err) {
        logger.error(`Database connection failed: ${err.message}`, { err });
        const error = new ApiError(500, "Database connection failed");
        return next(error);
      }
      const connectionTime = Date.now() - startConnection;
      logger.info(`Acquired database connection in ${connectionTime}ms`);

      try {
        await client.query("BEGIN");

        // Check for duplicate email
        const emailCheck = await client.query(
          "SELECT teacher_id FROM teachers WHERE email = $1 AND is_active = TRUE",
          [email]
        );
        if (emailCheck.rows.length > 0) {
          logger.error(`Teacher with email **** already exists`);
          const error = new ApiError(
            409,
            "A teacher with this email already exists"
          );
          return next(error);
        }

        // Check for duplicate teacher_id
        const idCheck = await client.query(
          "SELECT teacher_id FROM teachers WHERE teacher_id = $1 AND is_active = TRUE",
          [teacher_id]
        );
        if (idCheck.rows.length > 0) {
          logger.error(`Teacher with ID ${teacher_id} already exists`);
          const error = new ApiError(
            409,
            "A teacher with this ID already exists"
          );
          return next(error);
        }

        const startQuery = Date.now();
        const query = `
              INSERT INTO teachers (
                teacher_id, first_name, last_name, father_name, email, phone, address_line1, address_line2,
                city, postal_code, country, date_of_birth, hire_date, years_of_experience, employment_status,
                photo_url, resume_url, linkedin_url, emergency_contact_name, emergency_contact_phone,
                blood_group, gender, marital_status, nationality, teaching_license_number, educations,
                subjects_taught, cnic, is_active, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27::text[], $28, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              RETURNING *;
            `;

        const values = [
          teacher_id,
          first_name,
          last_name,
          father_name,
          email,
          phone,
          address_line1,
          address_line2,
          city,
          postal_code,
          country,
          date_of_birth,
          hire_date,
          years_of_experience,
          employment_status,
          photo_url,
          resume_url,
          linkedin_url,
          emergency_contact_name,
          emergency_contact_phone,
          blood_group,
          gender,
          marital_status,
          nationality,
          teaching_license_number,
          validatedEducations,
          subjectsArrayLiteral,
          cnic,
        ];

        const result = await client.query(query, values);
        const queryTime = Date.now() - startQuery;
        logger.info(`Inserted teacher with ID ${teacher_id} in ${queryTime}ms`);

        await client.query("COMMIT");
        return res
          .status(201)
          .json(
            new ApiResponse(201, result.rows[0], "Teacher created successfully")
          );
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error(`Insert error: ${err.message}`, { stack: err.stack });
        if (err.code === "23505") {
          const error = new ApiError(
            409,
            "A teacher with this email or ID already exists"
          );
          return next(error);
        }
        const error = new ApiError(500, "Failed to create teacher");
        return next(error);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Error creating teacher: ${error.message}`, {
        error,
        files: req.files,
        body: { ...req.body, cnic: "****", email: "****", phone: "****" },
        headers: req.headers,
        contentType: req.get("content-type"),
      });
      next(
        error instanceof ApiError
          ? error
          : new ApiError(500, "Internal server error")
      );
    }
  });
};

export { getAllteachers, getTeacherById };
