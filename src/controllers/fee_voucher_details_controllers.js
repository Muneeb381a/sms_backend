import { pool } from '../config/db.js';


// Create a new fee voucher detail
const createFeeVoucherDetail = async (req, res) => {
  const { voucher_id, fee_type_id, amount } = req.body;
  try {
    const query = `
      INSERT INTO fee_voucher_details (voucher_id, fee_type_id, amount)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [voucher_id, fee_type_id, amount];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating fee voucher detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all fee voucher details
const getAllFeeVoucherDetails = async (req, res) => {
  try {
    const query = 'SELECT * FROM fee_voucher_details ORDER BY id;';
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching fee voucher details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get a single fee voucher detail by ID
const getFeeVoucherDetailById = async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'SELECT * FROM fee_voucher_details WHERE id = $1;';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee voucher detail not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching fee voucher detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a fee voucher detail
const updateFeeVoucherDetail = async (req, res) => {
  const { id } = req.params;
  const { voucher_id, fee_type_id, amount } = req.body;
  try {
    const query = `
      UPDATE fee_voucher_details
      SET voucher_id = $1, fee_type_id = $2, amount = $3, created_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const values = [voucher_id, fee_type_id, amount, id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee voucher detail not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating fee voucher detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a fee voucher detail
const deleteFeeVoucherDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'DELETE FROM fee_voucher_details WHERE id = $1 RETURNING *;';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fee voucher detail not found' });
    }
    res.status(200).json({ message: 'Fee voucher detail deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee voucher detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export {
  createFeeVoucherDetail,
  getAllFeeVoucherDetails,
  getFeeVoucherDetailById,
  updateFeeVoucherDetail,
  deleteFeeVoucherDetail,
};