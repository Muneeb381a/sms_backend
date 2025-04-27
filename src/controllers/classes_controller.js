import { pool } from "../config/db.js";
import logger from "../services/logger.js";

const getAllClasses = async (req, res, next) => {
  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    try {
      const startQuery = Date.now();
      const result = await client.query(`
        SELECT 
          c.id,
          c.class_name,
          c.created_at,
          c.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', s.id,
                'class_id', s.class_id,
                'section_name', s.section_name,
                'created_at', s.created_at,
                'updated_at', s.updated_at
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'
          ) AS sections
        FROM classes c
        LEFT JOIN sections s ON c.id = s.class_id
        GROUP BY c.id, c.class_name, c.created_at, c.updated_at
        ORDER BY c.created_at DESC
      `);
      const queryTime = Date.now() - startQuery;
      logger.info(
        `Query executed in ${queryTime}ms, retrieved ${result.rows.length} classes`
      );

      if (result.rows.length === 0) {
        return res.status(200).json({
          status: "success",
          message: "No classes found",
          data: [],
        });
      }

      res.status(200).json({
        status: "success",
        message: "Classes retrieved successfully",
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`Error fetching classes: ${error.stack}`);
    const err = new Error("Failed to fetch classes");
    err.status = 500;
    next(err);
  }
};

const createClasses = async (req, res, next) => {
  const { class_name, sections } = req.body;

  if (!class_name) {
    logger.error("Class Name is required for creating class");
    const error = new Error("Class Name is required");
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

      // Check if class exists
      const startQuery = Date.now();
      let classResult = await client.query(
        "SELECT id, class_name, created_at, updated_at FROM classes WHERE class_name = $1",
        [class_name]
      );
      let classQueryTime = Date.now() - startQuery;
      let classId;
      let classData;

      if (classResult.rows.length === 0) {
        // Create new class
        classResult = await client.query(
          "INSERT INTO classes(class_name) VALUES ($1) RETURNING *",
          [class_name]
        );
        classQueryTime = Date.now() - startQuery;
        logger.info(
          `Inserted class with ID ${classResult.rows[0].id} in ${classQueryTime}ms`
        );
      } else {
        logger.info(
          `Found existing class with ID ${classResult.rows[0].id} in ${classQueryTime}ms`
        );
      }

      classId = classResult.rows[0].id;
      classData = classResult.rows[0];

      // Insert sections (if provided)
      let sectionsInserted = [];
      if (sections && Array.isArray(sections) && sections.length > 0) {
        for (const section_name of sections) {
          if (!section_name) {
            logger.warn("Skipping empty section");
            continue;
          }
          try {
            const sectionResult = await client.query(
              "INSERT INTO sections(class_id, section_name) VALUES ($1, $2) RETURNING *",
              [classId, section_name]
            );
            sectionsInserted.push(sectionResult.rows[0]);
            logger.info(
              `Inserted section ${section_name} for class ID ${classId}`
            );
          } catch (sectionErr) {
            if (sectionErr.code === "23505") {
              logger.warn(
                `Section ${section_name} already exists for class ID ${classId}`
              );
              const existingSection = await client.query(
                "SELECT * FROM sections WHERE class_id = $1 AND section_name = $2",
                [classId, section_name]
              );
              sectionsInserted.push(existingSection.rows[0]);
            } else {
              throw sectionErr;
            }
          }
        }
        logger.info(
          `Processed ${sectionsInserted.length} sections for class ID ${classId}`
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        class: {
          ...classData,
          sections: sectionsInserted,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Insert Error: ${err.stack}`);
      if (err.code === "23505") {
        const error = new Error(
          "A class or section with this name already exists"
        );
        error.status = 409;
        return next(error);
      }
      const error = new Error("Failed to create class");
      error.status = 500;
      next(error);
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Connection Error: ${err.stack}`);
    const error = new Error("Failed to connect to database");
    error.status = 500;
    next(error);
  }
};

const updateClasses = async (req, res, next) => {
  const { id } = req.params;
  const { class_name, sections, sections_to_delete } = req.body;

  if (
    !class_name &&
    (!sections || !Array.isArray(sections)) &&
    (!sections_to_delete || !Array.isArray(sections_to_delete))
  ) {
    logger.error(
      "At least one of class_name, sections, or sections_to_delete is required"
    );
    const error = new Error(
      "At least one of class_name, sections, or sections_to_delete is required"
    );
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

      // Check if class exists
      const classCheck = await client.query(
        "SELECT id, class_name FROM classes WHERE id = $1",
        [id]
      );
      if (classCheck.rows.length === 0) {
        logger.error(`Class with ID ${id} not found`);
        const error = new Error("Class not found");
        error.status = 404;
        return next(error);
      }

      // Update class_name if provided
      let updatedClass;
      if (class_name) {
        const startQuery = Date.now();
        const classResult = await client.query(
          "UPDATE classes SET class_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
          [class_name, id]
        );
        const queryTime = Date.now() - startQuery;
        logger.info(`Updated class with ID ${id} in ${queryTime}ms`);
        updatedClass = classResult.rows[0];
      } else {
        updatedClass = classCheck.rows[0];
      }

      // Manage sections (add new ones)
      let sectionsInserted = [];
      if (sections && Array.isArray(sections) && sections.length > 0) {
        for (const section_name of sections) {
          if (!section_name) {
            logger.warn("Skipping empty section");
            continue;
          }
          try {
            const sectionResult = await client.query(
              "INSERT INTO sections(class_id, section_name) VALUES ($1, $2) ON CONFLICT (class_id, section_name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP RETURNING *",
              [id, section_name]
            );
            sectionsInserted.push(sectionResult.rows[0]);
            logger.info(`Processed section ${section_name} for class ID ${id}`);
          } catch (sectionErr) {
            logger.error(`Section insert error: ${sectionErr.stack}`);
            throw sectionErr;
          }
        }
      }

      // Delete specified sections
      if (
        sections_to_delete &&
        Array.isArray(sections_to_delete) &&
        sections_to_delete.length > 0
      ) {
        const deleteResult = await client.query(
          "DELETE FROM sections WHERE class_id = $1 AND section_name = ANY($2::text[]) RETURNING *",
          [id, sections_to_delete]
        );
        logger.info(
          `Deleted ${deleteResult.rowCount} sections for class ID ${id}`
        );
      }

      // Fetch all current sections
      const sectionsResult = await client.query(
        "SELECT * FROM sections WHERE class_id = $1",
        [id]
      );
      const currentSections = sectionsResult.rows;

      await client.query("COMMIT");
      res.status(200).json({
        status: "success",
        message: "Class updated successfully",
        data: {
          ...updatedClass,
          sections: currentSections,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Update Error: ${err.stack}`);
      if (err.code === "23505") {
        const error = new Error("A class with this name already exists");
        error.status = 409;
        return next(error);
      }
      const error = new Error("Failed to update class");
      error.status = 500;
      next(error);
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Connection Error: ${err.stack}`);
    const error = new Error("Failed to connect to database");
    error.status = 500;
    next(error);
  }
};

const deleteClass = async (req, res, next) => {
  const { id } = req.params;

  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    try {
      const startQuery = Date.now();
      const result = await client.query('DELETE FROM classes WHERE id = $1 RETURNING *', [id]);
      const queryTime = Date.now() - startQuery;

      if (result.rowCount === 0) {
        logger.error(`Class with ID ${id} not found`);
        const error = new Error('Class not found');
        error.status = 404;
        return next(error);
      }

      logger.info(`Deleted class with ID ${id} in ${queryTime}ms`);
      res.status(200).json({
        status: 'success',
        message: 'Class deleted successfully',
        data: result.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Delete Error: ${err.stack}`);
    const error = new Error('Failed to delete class');
    error.status = 500;
    next(error);
  }
};

const getClassById = async (req, res, next) => {
  const { id } = req.params;

  try {
    const startConnection = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    try {
      const startQuery = Date.now();
      const result = await client.query(`
        SELECT 
          c.id,
          c.class_name,
          c.created_at,
          c.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', s.id,
                'class_id', s.class_id,
                'section_name', s.section_name,
                'created_at', s.created_at,
                'updated_at', s.updated_at
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'
          ) AS sections
        FROM classes c
        LEFT JOIN sections s ON c.id = s.class_id
        WHERE c.id = $1
        GROUP BY c.id, c.class_name, c.created_at, c.updated_at
      `, [id]);
      const queryTime = Date.now() - startQuery;

      if (result.rows.length === 0) {
        logger.error(`Class with ID ${id} not found`);
        const error = new Error('Class not found');
        error.status = 404;
        return next(error);
      }

      logger.info(`Query executed in ${queryTime}ms, retrieved class with ID ${id}`);
      res.status(200).json({
        status: 'success',
        message: 'Class retrieved successfully',
        data: result.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(`Error fetching class: ${err.stack}`);
    const error = new Error('Failed to fetch class');
    error.status = 500;
    next(error);
  }
};


export { getAllClasses, createClasses, updateClasses, getClassById, deleteClass };
