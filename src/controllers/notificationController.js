import { pool } from "../config/db.js";
import logger from "../services/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// create a notification

const createNotification = async (req, res, next) => {
  const { title, message, type, target_group } = req.body;

  if (!title || !message || !type || !target_group) {
    logger.error("All fields are required for creating notification");
    return next(new ApiError(400, "All fields are required"));
  }

  const validTypes = ["announcement", "alert", "reminder"];
  const validGroups = ["all", "students", "teachers", "parents"];

  if (!validTypes.includes(type)) {
    logger.error(`Invalid notification type: ${type}`);
    return next(new ApiError(400, "Invalid notification type"));
  }

  if (!validGroups.includes(target_group)) {
    logger.error(`Invalid target group: ${target_group}`);
    return next(new ApiError(400, "Invalid target group"));
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const notificationQuery = `
        INSERT INTO notifications (title, message, type, target_group, created_at, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING notification_id
      `;
    const notificationResult = await client.query(notificationQuery, [
      title,
      message,
      type,
      target_group,
    ]);
    const notificationId = notificationResult.rows[0].notification_id;

    const recipientQuery = `
        INSERT INTO notification_recipients (notification_id, group_name, is_read, read_at)
        VALUES ($1, $2, FALSE, NULL)
      `;
    await client.query(recipientQuery, [notificationId, target_group]);

    await client.query("COMMIT");

    logger.info(`Notification created with id ${notificationId}`);

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { notificationId },
          "Notification created successfully"
        )
      );
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Error creating notification: ${error.message}`);
    next(new ApiError(500, "Server error while creating notification"));
  } finally {
    client.release();
  }
};

// Fetch notiication for a group
const getGroupNotifications = async (req, res, next) => {
  const { group } = req.query;

  // Log the full query for debugging
  logger.debug(`Received query parameters: ${JSON.stringify(req.query)}`);

  // Validate group
  const validGroups = ["all", "students", "teachers", "parents"];
  if (!group || !validGroups.includes(group)) {
    logger.error(`Invalid or missing group parameter: ${group}`);
    return next(
      new ApiError(
        400,
        `Group parameter is missing or invalid. Expected one of: ${validGroups.join(", ")}`
      )
    );
  }

  try {
    const query = `
        SELECT n.notification_id, n.title, n.message, n.type, n.target_group, n.created_at, n.updated_at,
               nr.is_read, nr.read_at
        FROM notifications n
        LEFT JOIN notification_recipients nr ON n.notification_id = nr.notification_id
        WHERE n.target_group = $1 OR n.target_group = 'all'
        ORDER BY n.created_at DESC;
      `;
    const result = await pool.query(query, [group]);

    logger.info(`Fetched ${result.rowCount} notifications for group: ${group}`);
    res
      .status(200)
      .json(
        new ApiResponse(200, result.rows, "Notifications fetched successfully")
      );
  } catch (error) {
    logger.error(
      `Error fetching notifications for group ${group}: ${error.message}`
    );
    next(new ApiError(500, "Server error while fetching notifications"));
  }
};

export { createNotification, getGroupNotifications };
