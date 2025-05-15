import logger from "../services/logger.js"
import {pool} from "../config/db.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"


const createDiary = async(req, res, next) => {
    const {class_id, diary_date, homework} = req.body;

    if(!class_id || !diary_date || !Array.isArray(homework)) {
        logger.error("Missing required fields: class_id, diary_date, or homework array", {class_id, diary_date});

        throw new ApiError(400, "class_d, diary_date, and homework array are required");
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        logger.info("Creating Diary", {class_id, diary_date})


        // Insert Diary
        const diaryResult = await client.query(
            "INSERT INTO diaries (class_id, diary_date) VALUES ($1, $2) RETURNING id",
            [class_id, diary_date]
        );
        const diaryId = diaryResult.rows[0].id

        // insert homework
        for(const hw of homework) {
            if(!hw.subject || hw.description |!hw.due_date) {
                logger.error("Invalid homework entry", {homework: hw});
                throw new ApiError(400, "Each homework entry must have subject, description, and due date")
            }

            await client.query(
                "INSERT INTO homework (diary_id, subject, description, due_date) VALUES ($1, $2, $3, $4)",
                [diaryId, hw.subject, hw.description, hw.due_date]
            )
        }


        await client.query("COMMIT");
        logger.info("Diary Created Succesfully", {diary_id: diaryId});
        return res.status(201).json(
            new ApiResponse(201, {diary_id: diaryId}, "Diary created succesfully")
        )
    } catch (error) {
        await client.query("ROLLBACK");
        logger.error("Failed to create diary", {error: error.message, class_id, diary_date})
    } finally {
        client.release();
    }
}


export {createDiary};