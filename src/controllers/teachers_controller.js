import { pool } from "../config/db.js";

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

export { getAllteachers, getTeacherById };
