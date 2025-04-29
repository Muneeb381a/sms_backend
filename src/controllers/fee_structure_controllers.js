import { pool } from "../config/db.js";

// Note: Ensure express.json() middleware is used in the main app file
// before mounting routes, e.g., app.use(express.json()).
// Client must send Content-Type: application/json for POST/PATCH requests.

// Get all fee structures
const getAllFeeStructures = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM fee_structures ORDER BY created_at DESC"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching fee structures:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get fee structure by ID
const getFeeStructureById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM fee_structures WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Fee structure not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching fee structure:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create a new fee structure
const createFeeStructure = async (req, res) => {
  console.log("Create fee structure request body:", req.body);
  console.log("Content-Type:", req.get("Content-Type")); // Debug header
  if (req.body === undefined) {
    return res
      .status(400)
      .json({ error: "Request body is missing or not JSON" });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: "Request body is empty" });
  }
  const { class_id, fee_type_id, amount, frequency, academic_year } = req.body;

  // Validate required fields
  if (!class_id || !fee_type_id || !amount || !frequency || !academic_year) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // Validate frequency
  const validFrequencies = ["monthly", "annual", "one-time"];
  if (!validFrequencies.includes(frequency)) {
    return res
      .status(400)
      .json({ error: "Frequency must be monthly, annual, or one-time" });
  }

  // Validate academic_year format (e.g., 2024-2025)
  if (!/^\d{4}-\d{4}$/.test(academic_year)) {
    return res
      .status(400)
      .json({ error: "Academic year must be in YYYY-YYYY format" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO fee_structures (class_id, fee_type_id, amount, frequency, academic_year) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [class_id, fee_type_id, amount, frequency, academic_year]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      // Foreign key violation
      if (error.constraint.includes("class_id")) {
        return res
          .status(400)
          .json({ error: "Invalid class_id: Class does not exist" });
      }
      if (error.constraint.includes("fee_type_id")) {
        return res
          .status(400)
          .json({ error: "Invalid fee_type_id: Fee type does not exist" });
      }
    }
    console.error("Error creating fee structure:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update a fee structure
const updateFeeStructure = async (req, res) => {
  const { id } = req.params;
  console.log("Update fee structure request body:", req.body);
  console.log("Content-Type:", req.get("Content-Type")); // Debug header
  if (req.body === undefined) {
    return res
      .status(400)
      .json({ error: "Request body is missing or not JSON" });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: "Request body is empty" });
  }
  const { class_id, fee_type_id, amount, frequency, academic_year } = req.body;

  // Validate required fields
  if (!class_id || !fee_type_id || !amount || !frequency || !academic_year) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // Validate frequency
  const validFrequencies = ["monthly", "annual", "one-time"];
  if (!validFrequencies.includes(frequency)) {
    return res
      .status(400)
      .json({ error: "Frequency must be monthly, annual, or one-time" });
  }

  // Validate academic_year format
  if (!/^\d{4}-\d{4}$/.test(academic_year)) {
    return res
      .status(400)
      .json({ error: "Academic year must be in YYYY-YYYY format" });
  }

  try {
    const result = await pool.query(
      "UPDATE fee_structures SET class_id = $1, fee_type_id = $2, amount = $3, frequency = $4, academic_year = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *",
      [class_id, fee_type_id, amount, frequency, academic_year, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Fee structure not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      // Foreign key violation
      if (error.constraint.includes("class_id")) {
        return res
          .status(400)
          .json({ error: "Invalid class_id: Class does not exist" });
      }
      if (error.constraint.includes("fee_type_id")) {
        return res
          .status(400)
          .json({ error: "Invalid fee_type_id: Fee type does not exist" });
      }
    }
    console.error("Error updating fee structure:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a fee structure
const deleteFeeStructure = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM fee_structures WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Fee structure not found" });
    }
    res.status(200).json({ message: "Fee structure deleted successfully" });
  } catch (error) {
    console.error("Error deleting fee structure:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export {
  getAllFeeStructures,
  getFeeStructureById,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
};
