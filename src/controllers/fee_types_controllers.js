import { pool } from '../config/db.js';


// Get all fee types
const getAllFeeTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fee_types ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching fee types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get fee type by ID
const getFeeTypeById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM fee_types WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee type not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching fee type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new fee type
const createFeeType = async (req, res) => {
  console.log('Create fee type request body:', req.body);
  console.log('Content-Type:', req.get('Content-Type')); // Debug header
  if (req.body === undefined) {
    return res.status(400).json({ error: 'Request body is missing or not JSON' });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Request body is empty' });
  }
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO fee_types (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Fee type name already exists' });
    }
    console.error('Error creating fee type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a fee type
const updateFeeType = async (req, res) => {
  const { id } = req.params;
  console.log('Update fee type request body:', req.body);
  console.log('Content-Type:', req.get('Content-Type')); // Debug header
  if (req.body === undefined) {
    return res.status(400).json({ error: 'Request body is missing or not JSON' });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Request body is empty' });
  }
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE fee_types SET name = $1, created_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [name, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee type not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Fee type name already exists' });
    }
    console.error('Error updating fee type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a fee type
const deleteFeeType = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM fee_types WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee type not found' });
    }
    res.status(200).json({ message: 'Fee type deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export {
  getAllFeeTypes,
  getFeeTypeById,
  createFeeType,
  updateFeeType,
  deleteFeeType,
};