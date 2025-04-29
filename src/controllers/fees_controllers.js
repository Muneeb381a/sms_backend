import { pool } from "../config/db.js";

// Helper function to update voucher status
async function updateVoucherStatus(voucherId, client) {
  // Get total fee amount from details
  const totalResult = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total 
        FROM fee_voucher_details 
        WHERE voucher_id = $1`,
    [voucherId]
  );

  // Get current voucher state
  const voucherResult = await client.query(
    `SELECT paid_amount 
        FROM fee_vouchers 
        WHERE id = $1`,
    [voucherId]
  );

  const total = parseFloat(totalResult.rows[0].total);
  const paid = parseFloat(voucherResult.rows[0].paid_amount);

  // Determine new status
  let status = "pending";
  if (paid >= total && total > 0) status = "paid";
  else if (paid > 0) status = "partial";

  // Update status
  await client.query(
    `UPDATE fee_vouchers 
        SET status = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2`,
    [status, voucherId]
  );
}

// Create new fee voucher
export const createVoucher = async (req, res) => {
  const { student_id, due_date } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check for existing voucher
    const existing = await client.query(
      `SELECT id 
            FROM fee_vouchers 
            WHERE student_id = $1 AND due_date = $2`,
      [student_id, due_date]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Voucher already exists for this student and due date",
      });
    }

    // Create new voucher
    const result = await client.query(
      `INSERT INTO fee_vouchers (student_id, due_date)
            VALUES ($1, $2)
            RETURNING *`,
      [student_id, due_date]
    );

    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Get voucher by ID
export const getVoucher = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fv.*, s.first_name AS student_name
            FROM fee_vouchers fv
            JOIN students s ON fv.student_id = s.id
            WHERE fv.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Voucher not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update voucher payment
export const updatePayment = async (req, res) => {
  const { amount } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current payment status
    const voucher = await client.query(
      `SELECT paid_amount 
            FROM fee_vouchers 
            WHERE id = $1 
            FOR UPDATE`,
      [req.params.id]
    );

    if (voucher.rows.length === 0) {
      return res.status(404).json({ error: "Voucher not found" });
    }

    // Get total fees
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
            FROM fee_voucher_details
            WHERE voucher_id = $1`,
      [req.params.id]
    );

    const total = parseFloat(totalResult.rows[0].total);
    const newPaid =
      parseFloat(voucher.rows[0].paid_amount) + parseFloat(amount);

    // Validate payment
    if (newPaid > total) {
      return res.status(400).json({
        error: `Payment exceeds total amount of ${total}`,
      });
    }

    // Update payment
    await client.query(
      `UPDATE fee_vouchers
            SET paid_amount = $1
            WHERE id = $2`,
      [newPaid, req.params.id]
    );

    // Update status
    await updateVoucherStatus(req.params.id, client);

    await client.query("COMMIT");
    res.json({ message: "Payment updated successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Get all vouchers for a student
export const getStudentVouchers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
            FROM fee_vouchers
            WHERE student_id = $1
            ORDER BY due_date DESC`,
      [req.params.studentId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete voucher
export const deleteVoucher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `DELETE FROM fee_vouchers 
            WHERE id = $1 
            RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Voucher not found" });
    }

    await client.query("COMMIT");
    res.json({ message: "Voucher deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};
