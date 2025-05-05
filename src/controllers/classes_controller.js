import { pool } from "../config/db.js";
import logger from "../services/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// Simple input validation function
const validateInput = (data, fieldName) => {
  if (typeof data === "string" && data.trim().length === 0) {
    throw new ApiError(400, `${fieldName} cannot be empty`);
  }
  if (typeof data === "string" && data.length > 100) {
    throw new ApiError(400, `${fieldName} cannot exceed 100 characters`);
  }
  if (Array.isArray(data)) {
    if (data.length > 50) {
      throw new ApiError(400, `${fieldName} cannot exceed 50 items`);
    }
    data.forEach((item, index) => {
      if (typeof item !== "string" || item.trim().length === 0) {
        throw new ApiError(
          400,
          `${fieldName}[${index}] must be a non-empty string`
        );
      }
      if (item.length > 100) {
        throw new ApiError(
          400,
          `${fieldName}[${index}] cannot exceed 100 characters`
        );
      }
    });
  }
};

const getAllClasses = async (req, res, next) => {
  let client;
  try {
    // TODO: Add authentication middleware to ensure req.user exists
    // Example: if (!req.user) throw new ApiError(401, "Unauthorized");

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    if (page < 1 || limit < 1 || limit > 100) {
      throw new ApiError(400, "Invalid page or limit parameters");
    }
    const offset = (page - 1) * limit;

    const startConnection = Date.now();
    client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    const startQuery = Date.now();
    const queryText = `
      WITH class_sections AS (
        SELECT 
          s.class_id,
          json_agg(
            json_build_object(
              'id', s.id,
              'class_id', s.class_id,
              'section_name', s.section_name,
              'created_at', s.created_at,
              'updated_at', s.created_at
            )
          ) FILTER (WHERE s.id IS NOT NULL) AS sections
        FROM sections s
        GROUP BY s.class_id
      )
      SELECT 
        c.id,
        c.class_name,
        c.created_at,
        c.updated_at,
        COALESCE(cs.sections, '[]') AS sections
      FROM classes c
      LEFT JOIN class_sections cs ON c.id = cs.class_id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2;
    `;

    const result = await client.query(queryText, [limit, offset]);
    const queryTime = Date.now() - startQuery;
    logger.info(
      `Query executed in ${queryTime}ms, retrieved ${result.rows.length} classes`,
      { userId: req.user?.id }
    );

    if (!result.rows.length) {
      return res.status(200).json(
        new ApiResponse(200, [], "No classes found", {
          queryTime,
          connectionTime,
          page,
          limit,
        })
      );
    }

    res.status(200).json(
      new ApiResponse(200, result.rows, "Classes retrieved successfully", {
        queryTime,
        connectionTime,
        page,
        limit,
      })
    );
  } catch (error) {
    logger.error(`Error fetching classes: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, "Failed to fetch classes", error.message)
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error(`Error releasing client: ${releaseError.message}`);
      }
    }
  }
};

const createClasses = async (req, res, next) => {
  const { class_name, sections } = req.body;
  let client;

  try {
    // TODO: Add authentication middleware to ensure req.user exists
    // Example: if (!req.user) throw new ApiError(401, "Unauthorized");

    // Validate inputs
    validateInput(class_name, "class_name");
    if (sections) validateInput(sections, "sections");

    const startConnection = Date.now();
    client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    await client.query("BEGIN");

    const startQuery = Date.now();
    let classResult = await client.query(
      "SELECT id, class_name, created_at, updated_at FROM classes WHERE class_name = $1",
      [class_name]
    );
    let classId, classData;

    if (classResult.rows.length === 0) {
      classResult = await client.query(
        "INSERT INTO classes(class_name, version) VALUES ($1, 0) RETURNING *",
        [class_name]
      );
      logger.info(`Inserted class with ID ${classResult.rows[0].id}`, {
        userId: req.user?.id,
      });
    } else {
      logger.info(`Found existing class with ID ${classResult.rows[0].id}`, {
        userId: req.user?.id,
      });
    }

    classId = classResult.rows[0].id;
    classData = classResult.rows[0];
    const queryTime = Date.now() - startQuery;

    let sectionsInserted = [];
    if (sections && Array.isArray(sections) && sections.length > 0) {
      const uniqueSections = [...new Set(sections.filter((s) => s))];
      if (uniqueSections.length > 0) {
        const values = uniqueSections.map(
          (_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`
        );
        const queryParams = uniqueSections.flatMap((section_name) => [
          classId,
          section_name,
        ]);

        const sectionResult = await client.query(
          `INSERT INTO sections(class_id, section_name) 
           VALUES ${values.join(", ")}
           ON CONFLICT (class_id, section_name) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP 
           RETURNING *`,
          queryParams
        );
        sectionsInserted = sectionResult.rows;
        logger.info(
          `Processed ${sectionsInserted.length} sections for class ID ${classId}`,
          { userId: req.user?.id }
        );
      }
    }

    await client.query("COMMIT");
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { ...classData, sections: sectionsInserted },
          "Class created successfully",
          { queryTime, connectionTime }
        )
      );
  } catch (error) {
    await client?.query("ROLLBACK");
    logger.error(`Error creating class: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });
    if (error.code === "23505") {
      return next(
        new ApiError(
          409,
          "A class or section with this name already exists",
          error.message
        )
      );
    }
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, "Failed to create class", error.message)
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error(`Error releasing client: ${releaseError.message}`);
      }
    }
  }
};

const updateClasses = async (req, res, next) => {
  const { id } = req.params;
  const { class_name, sections, sections_to_delete, version } = req.body;
  let client;

  try {
    // TODO: Add authentication middleware to ensure req.user exists
    // Example: if (!req.user) throw new ApiError(401, "Unauthorized");

    // Validate inputs
    if (!/^\d+$/.test(id)) throw new ApiError(400, "Invalid class ID");
    if (class_name) validateInput(class_name, "class_name");
    if (sections) validateInput(sections, "sections");
    if (sections_to_delete)
      validateInput(sections_to_delete, "sections_to_delete");
    if (
      !class_name &&
      (!sections || !Array.isArray(sections) || sections.length === 0) &&
      (!sections_to_delete ||
        !Array.isArray(sections_to_delete) ||
        sections_to_delete.length === 0)
    ) {
      throw new ApiError(
        400,
        "At least one of class_name, sections, or sections_to_delete is required"
      );
    }
    let parsedVersion = version;
    if (typeof version === "string" && /^\d+$/.test(version)) {
      parsedVersion = parseInt(version, 10);
    }
    if (
      version !== undefined &&
      (typeof parsedVersion !== "number" || !Number.isInteger(parsedVersion))
    ) {
      throw new ApiError(400, "Version must be an integer");
    }

    const startConnection = Date.now();
    client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    await client.query("BEGIN");

    const startQuery = Date.now();
    const classCheck = await client.query(
      "SELECT id, class_name, version FROM classes WHERE id = $1",
      [id]
    );
    if (classCheck.rows.length === 0) {
      logger.error(`Class with ID ${id} not found`, { userId: req.user?.id });
      throw new ApiError(404, "Class not found");
    }

    let updatedClass = classCheck.rows[0];
    if (class_name) {
      const currentVersion = classCheck.rows[0].version;
      let classResult;
      if (parsedVersion !== undefined) {
        // Use optimistic locking if version is provided
        if (currentVersion !== parsedVersion) {
          logger.error(`Version conflict for class ID ${id}`, {
            userId: req.user?.id,
          });
          throw new ApiError(
            409,
            `Version conflict: expected ${currentVersion}, received ${parsedVersion}`
          );
        }
        classResult = await client.query(
          "UPDATE classes SET class_name = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = $2 AND version = $3 RETURNING *",
          [class_name, id, parsedVersion]
        );
      } else {
        // No version check if version is not provided
        classResult = await client.query(
          "UPDATE classes SET class_name = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = $2 RETURNING *",
          [class_name, id]
        );
      }
      if (classResult.rows.length === 0) {
        throw new ApiError(409, "Version conflict during update");
      }
      updatedClass = classResult.rows[0];
      logger.info(`Updated class with ID ${id}`, { userId: req.user?.id });
    }

    let sectionsInserted = [];
    if (sections && Array.isArray(sections) && sections.length > 0) {
      const uniqueSections = [...new Set(sections.filter((s) => s))];
      if (uniqueSections.length > 0) {
        const values = uniqueSections.map(
          (_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`
        );
        const queryParams = uniqueSections.flatMap((section_name) => [
          id,
          section_name,
        ]);

        const sectionResult = await client.query(
          `INSERT INTO sections(class_id, section_name) 
           VALUES ${values.join(", ")}
           ON CONFLICT (class_id, section_name) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP 
           RETURNING *`,
          queryParams
        );
        sectionsInserted = sectionResult.rows;
        logger.info(
          `Processed ${sectionsInserted.length} sections for class ID ${id}`,
          { userId: req.user?.id }
        );
      }
    }

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
        `Deleted ${deleteResult.rowCount} sections for class ID ${id}`,
        { userId: req.user?.id }
      );
    }

    const sectionsResult = await client.query(
      "SELECT * FROM sections WHERE class_id = $1",
      [id]
    );
    const currentSections = sectionsResult.rows;
    const queryTime = Date.now() - startQuery;

    await client.query("COMMIT");
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { ...updatedClass, sections: currentSections },
          "Class updated successfully",
          { queryTime, connectionTime }
        )
      );
  } catch (error) {
    await client?.query("ROLLBACK");
    logger.error(`Error updating class: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });
    if (error.code === "23505") {
      return next(
        new ApiError(
          409,
          "A class with this name already exists",
          error.message
        )
      );
    }
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, "Failed to update class", error.message)
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error(`Error releasing client: ${releaseError.message}`);
      }
    }
  }
};

const getClassById = async (req, res, next) => {
  const { id } = req.params;
  let client;

  try {
    // TODO: Add authentication middleware to ensure req.user exists
    // Example: if (!req.user) throw new ApiError(401, "Unauthorized");

    if (!/^\d+$/.test(id)) throw new ApiError(400, "Invalid class ID");

    const startConnection = Date.now();
    client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    const startQuery = Date.now();
    const queryText = `
      WITH class_sections AS (
        SELECT 
          s.class_id,
          json_agg(
            json_build_object(
              'id', s.id,
              'class_id', s.class_id,
              'section_name', s.section_name,
              'created_at', s.created_at,
              'updated_at', s.created_at
            )
          ) FILTER (WHERE s.id IS NOT NULL) AS sections
        FROM sections s
        WHERE s.class_id = $1
        GROUP BY s.class_id
      )
      SELECT 
        c.id,
        c.class_name,
        c.created_at,
        c.updated_at,
        c.version,
        COALESCE(cs.sections, '[]') AS sections
      FROM classes c
      LEFT JOIN class_sections cs ON c.id = cs.class_id
      WHERE c.id = $1;
    `;

    const result = await client.query(queryText, [id]);
    const queryTime = Date.now() - startQuery;

    if (!result.rows.length) {
      logger.error(`Class with ID ${id} not found`, { userId: req.user?.id });
      throw new ApiError(404, "Class not found");
    }

    logger.info(`Retrieved class with ID ${id} in ${queryTime}ms`, {
      userId: req.user?.id,
    });
    return res.status(200).json(
      new ApiResponse(200, result.rows[0], "Class retrieved successfully", {
        queryTime,
        connectionTime,
      })
    );
  } catch (error) {
    logger.error(`Error fetching class: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, "Failed to fetch class", error.message)
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error(`Error releasing client: ${releaseError.message}`);
      }
    }
  }
};

const deleteClass = async (req, res, next) => {
  const { id } = req.params;
  let client;

  try {
    // TODO: Add authentication middleware to ensure req.user exists
    // Example: if (!req.user) throw new ApiError(401, "Unauthorized");

    if (!/^\d+$/.test(id)) throw new ApiError(400, "Invalid class ID");

    const startConnection = Date.now();
    client = await pool.connect();
    const connectionTime = Date.now() - startConnection;
    logger.info(`Acquired database connection in ${connectionTime}ms`);

    await client.query("BEGIN");

    const startQuery = Date.now();
    // Delete sections first due to foreign key constraints
    await client.query("DELETE FROM sections WHERE class_id = $1", [id]);
    const result = await client.query(
      "DELETE FROM classes WHERE id = $1 RETURNING *",
      [id]
    );
    const queryTime = Date.now() - startQuery;

    if (result.rowCount === 0) {
      logger.error(`Class with ID ${id} not found`, { userId: req.user?.id });
      throw new ApiError(404, "Class not found");
    }

    logger.info(`Deleted class with ID ${id} in ${queryTime}ms`, {
      userId: req.user?.id,
    });
    await client.query("COMMIT");
    return res.status(200).json(
      new ApiResponse(200, result.rows[0], "Class deleted successfully", {
        queryTime,
        connectionTime,
      })
    );
  } catch (error) {
    await client?.query("ROLLBACK");
    logger.error(`Error deleting class: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });
    next(
      error instanceof ApiError
        ? error
        : new ApiError(500, "Failed to delete class", error.message)
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error(`Error releasing client: ${releaseError.message}`);
      }
    }
  }
};

// Define wrapped controllers for export
// TODO: Add rate limiting middleware to prevent abuse
// Example: app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
const wrappedGetAllClasses = (req, res, next) => {
  const start = Date.now();
  return getAllClasses(req, res, next).finally(() => {
    const duration = Date.now() - start;
    logger.info(`getAllClasses request processed in ${duration}ms`, {
      userId: req.user?.id,
    });
  });
};

const wrappedCreateClasses = (req, res, next) => {
  const start = Date.now();
  return createClasses(req, res, next).finally(() => {
    const duration = Date.now() - start;
    logger.info(`createClasses request processed in ${duration}ms`, {
      userId: req.user?.id,
    });
  });
};

const wrappedUpdateClasses = (req, res, next) => {
  const start = Date.now();
  return updateClasses(req, res, next).finally(() => {
    const duration = Date.now() - start;
    logger.info(`updateClasses request processed in ${duration}ms`, {
      userId: req.user?.id,
    });
  });
};

const wrappedGetClassById = (req, res, next) => {
  const start = Date.now();
  return getClassById(req, res, next).finally(() => {
    const duration = Date.now() - start;
    logger.info(`getClassById request processed in ${duration}ms`, {
      userId: req.user?.id,
    });
  });
};

const wrappedDeleteClass = (req, res, next) => {
  const start = Date.now();
  return deleteClass(req, res, next).finally(() => {
    const duration = Date.now() - start;
    logger.info(`deleteClass request processed in ${duration}ms`, {
      userId: req.user?.id,
    });
  });
};

// Export wrapped controllers
export {
  wrappedGetAllClasses as getAllClasses,
  wrappedCreateClasses as createClasses,
  wrappedUpdateClasses as updateClasses,
  wrappedGetClassById as getClassById,
  wrappedDeleteClass as deleteClass,
};
