import logger from "../services/logger.js";
import { pool } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const createDiary = async (req, res, next) => {
  const { class_id, diary_date, homework } = req.body;

  if (!class_id || !diary_date || !Array.isArray(homework)) {
    logger.error(
      "Missing required fields: class_id, diary_date, or homework array",
      { class_id, diary_date }
    );

    throw new ApiError(
      400,
      "class_d, diary_date, and homework array are required"
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    logger.info("Creating Diary", { class_id, diary_date });

    // Insert Diary
    const diaryResult = await client.query(
      "INSERT INTO diaries (class_id, diary_date) VALUES ($1, $2) RETURNING id",
      [class_id, diary_date]
    );
    const diaryId = diaryResult.rows[0].id;

    // insert homework
    for (const hw of homework) {
      if (!hw.subject || hw.description | !hw.due_date) {
        logger.error("Invalid homework entry", { homework: hw });
        throw new ApiError(
          400,
          "Each homework entry must have subject, description, and due date"
        );
      }

      await client.query(
        "INSERT INTO homework (diary_id, subject, description, due_date) VALUES ($1, $2, $3, $4)",
        [diaryId, hw.subject, hw.description, hw.due_date]
      );
    }

    await client.query("COMMIT");
    logger.info("Diary Created Succesfully", { diary_id: diaryId });
    return res
      .status(201)
      .json(
        new ApiResponse(201, { diary_id: diaryId }, "Diary created succesfully")
      );
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to create diary", {
      error: error.message,
      class_id,
      diary_date,
    });
  } finally {
    client.release();
  }
};

// get all diaries by class

const getDiariesByClass = async (req, res, next) => {
  const { class_id } = req.params;

  if (!class_id) {
    logger.error("Missing class id parameter");
    throw new ApiError(400, "class_id is required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    logger.info("Fetching diaries for class", { class_id });

    const diariesResult = await client.query(
      `SELECT d.id, d.diary_date, h.id AS homework_id, h.subject, h.description, h.due_date
             FROM diaries d
             LEFT JOIN homework h ON d.id = h.diary_id
             WHERE d.class_id = $1
             ORDER BY d.diary_date, h.id`,
      [class_id]
    );

    const diaries = diariesResult.rows.reduce((acc, row) => {
      let diary = acc.find((item) => item.id === row.id);
      if (!diary) {
        diary = {
          id: row.id,
          diary_date: row.diary_date,
          homework: [],
        };
        acc.push(diary);
      }

      if (row.homework_id) {
        diary.homework.push({
          id: row.homework_id,
          subject: row.subject,
          description: row.description,
          due_date: row.due_date,
        });
      }

      return acc;
    }, []);

    logger.info("Diaries fetched successfully", {
      class_id,
      diary_count: diaries.length,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, diaries, "Diaries fetched successfully"));
  } catch (error) {
    logger.error("Failed to fetch diaries", { error: error.message, class_id });
    throw new ApiError(
      error.statusCode || 500,
      error.message || "Failed to fetch diaries"
    );
  } finally {
    client.release();
  }
};

// update diary

const updateDiary = async (req, res) => {
  const { id } = req.params;
  const { diary_date, homework } = req.body;

  if (!diary_date && (!homework || !Array.isArray(homework))) {
    logger.error("No valid fields provided for update", { diary_id: id });
    throw new ApiError(
      400,
      "At least diary_date or homework array is required"
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    logger.info("Updating diary", { diary_id: id });

    // Update diary date if provided
    if (diary_date) {
      const result = await client.query(
        "UPDATE diaries SET diary_date = $1 WHERE id = $2 RETURNING id",
        [diary_date, id]
      );
      if (result.rowCount === 0) {
        logger.error("Diary not found", { diary_id: id });
        throw new ApiError(404, "Diary not found");
      }
    }

    // Update homework if provided
    if (Array.isArray(homework)) {
      await client.query("DELETE FROM homework WHERE diary_id = $1", [id]);

      for (const hw of homework) {
        if (!hw.subject || !hw.description || !hw.due_date) {
          logger.error("Invalid homework entry", { homework: hw });
          throw new ApiError(
            400,
            "Each homework entry must have subject, description, due_date"
          );
        }

        await client.query(
          "INSERT INTO homework (diary_id, subject, description, due_date) VALUES ($1, $2, $3, $4)",
          [id, hw.subject, hw.description, hw.due_date]
        );
      }
    }

    await client.query("COMMIT");
    logger.info("Diary updated successfully", { diary_id: id });
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Diary Updated Successfully"));
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to update Diary", {
      error: error.message,
      diary_id: id,
    });
    throw new ApiError(
      error.statusCode || 500,
      error.message || "Failed to update diary"
    );
  } finally {
    client.release();
  }
};


// delete diaries


const deleteDiary = async(req, res)=> {
    const {id} = req.params;

    if(!id) {
        logger.error("Provide dairy id parameter");
        throw new ApiError(400, "diary_id parameter is required")
    }

    try {
        logger.info("Deleting Diary", {diary_id: id})

        const result = await pool.query(
            "DELETE FROM diaries WHERE id = $1", [id]);
        if(result.rowsCount === 0) {
            logger.error("Diary not found", {diary_id: id})
            throw new ApiError(404, "Diary not found")
        }
        logger.info("Diary deleted succesfully", {iary_id: id});
        return res.status(200).json(
            new ApiResponse(200, {}, "Diary deleted Succesfully")
        );
    } catch (error) {
        logger.error("Failed to delete diary", {error: error.message, diary_id: id});
        throw new ApiError(error.statusCode || 500, error.message || "Failed to delete diary")
    }
}

export { createDiary, getDiariesByClass, updateDiary, deleteDiary };
