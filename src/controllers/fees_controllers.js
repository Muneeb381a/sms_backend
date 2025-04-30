import { pool } from "../config/db.js";
import PDFDocument from "pdfkit";
import { format } from "date-fns";

// Helper function to update voucher status
async function updateVoucherStatus(voucherId, client) {
  const totalResult = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total 
        FROM fee_voucher_details 
        WHERE voucher_id = $1`,
    [voucherId]
  );

  const voucherResult = await client.query(
    `SELECT paid_amount 
        FROM fee_vouchers 
        WHERE id = $1`,
    [voucherId]
  );

  const total = parseFloat(totalResult.rows[0].total);
  const paid = parseFloat(voucherResult.rows[0].paid_amount);

  let status = "pending";
  if (paid >= total && total > 0) status = "paid";
  else if (paid > 0) status = "partial";

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

    if (!student_id || !due_date || isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: "Invalid student_id or due_date" });
    }

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

    const result = await client.query(
      `INSERT INTO fee_vouchers (student_id, due_date)
            VALUES ($1, $2)
            RETURNING *`,
      [student_id, due_date]
    );

    await client.query("COMMIT");
    res
      .status(201)
      .json({ data: result.rows[0], message: "Voucher created successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating voucher:", error);
    res.status(500).json({ error: "Internal server error" });
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

    res.json({
      data: result.rows[0],
      message: "Voucher retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching voucher:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update voucher payment
export const updatePayment = async (req, res) => {
  const { amount } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

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

    const totalResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
            FROM fee_voucher_details
            WHERE voucher_id = $1`,
      [req.params.id]
    );

    const total = parseFloat(totalResult.rows[0].total);
    const newPaid =
      parseFloat(voucher.rows[0].paid_amount) + parseFloat(amount);

    if (newPaid > total) {
      return res.status(400).json({
        error: `Payment exceeds total amount of ${total}`,
      });
    }

    await client.query(
      `UPDATE fee_vouchers
            SET paid_amount = $1
            WHERE id = $2`,
      [newPaid, req.params.id]
    );

    await updateVoucherStatus(req.params.id, client);

    await client.query("COMMIT");
    res.json({ message: "Payment updated successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating payment:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get all vouchers for a student
export const getStudentVouchers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT *
            FROM fee_vouchers
            WHERE student_id = $1
            ORDER BY due_date DESC
            LIMIT $2 OFFSET $3`,
      [req.params.studentId, limit, offset]
    );

    const totalResult = await pool.query(
      `SELECT COUNT(*) AS total
            FROM fee_vouchers
            WHERE student_id = $1`,
      [req.params.studentId]
    );

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].total),
      },
      message: "Vouchers retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching student vouchers:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error deleting voucher:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Generate PDF for fee voucher using pdfkit
export const generateVoucherPDF = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // Fetch voucher details
    const voucherResult = await client.query(
      `SELECT fv.*, s.first_name, s.last_name
            FROM fee_vouchers fv
            JOIN students s ON fv.student_id = s.id
            WHERE fv.id = $1`,
      [id]
    );

    if (voucherResult.rows.length === 0) {
      return res.status(404).json({ error: "Voucher not found" });
    }

    const voucher = voucherResult.rows[0];

    // Fetch fee details
    const detailsResult = await client.query(
      `SELECT fvd.*, ft.name AS fee_type
            FROM fee_voucher_details fvd
            JOIN fee_types ft ON fvd.fee_type_id = ft.id
            WHERE fvd.voucher_id = $1`,
      [id]
    );

    const total = detailsResult.rows.reduce(
      (sum, detail) => sum + parseFloat(detail.amount),
      0
    );

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=voucher-${id}.pdf`
    );
    doc.pipe(res);

    // Border
    doc.lineWidth(2).strokeColor("#007bff").rect(20, 20, 555, 802).stroke();

    // Header
    doc
      .fontSize(24)
      .fillColor("#007bff")
      .text("Fee Voucher", { align: "center" });
    doc
      .fontSize(12)
      .fillColor("#333")
      .text(`Voucher ID: ${voucher.id}`, { align: "center" });
    doc.text(`Date: ${format(new Date(), "MMMM dd, yyyy")}`, {
      align: "center",
    });
    doc.moveDown(2);

    // Details
    doc
      .fontSize(14)
      .fillColor("#333")
      .text(`Student Name: ${voucher.first_name} ${voucher.last_name}`, 40);
    doc.text(
      `Due Date: ${format(new Date(voucher.due_date), "MMMM dd, yyyy")}`,
      40
    );
    doc.text(`Status: ${voucher.status}`, 40);
    doc.text(`Paid Amount: $${voucher.paid_amount}`, 40);
    doc.moveDown(2);

    // Table Header
    const tableTop = doc.y;
    doc
      .fontSize(12)
      .fillColor("#fff")
      .rect(40, tableTop, 515, 20)
      .fill("#007bff");
    doc.text("Fee Type", 50, tableTop + 5);
    doc.text("Amount", 450, tableTop + 5, { align: "right" });

    // Table Rows
    let currentY = tableTop + 20;
    detailsResult.rows.forEach((detail) => {
      doc.fillColor("#333").rect(40, currentY, 515, 20).stroke();
      doc.text(detail.fee_type, 50, currentY + 5);
      doc.text(`$${detail.amount}`, 450, currentY + 5, { align: "right" });
      currentY += 20;
    });

    // Total
    doc
      .fontSize(16)
      .fillColor("#333")
      .text(`Total: $${total.toFixed(2)}`, 450, currentY + 20, {
        align: "right",
      });
    doc.moveDown(2);

    // Footer
    doc
      .fontSize(10)
      .fillColor("#777")
      .text("Generated by School Management System", { align: "center" });
    doc.text("Please pay by the due date to avoid late fees.", {
      align: "center",
    });

    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Updated fee_voucher_details controllers with status update
export const createFeeVoucherDetail = async (req, res) => {
  const { voucher_id, fee_type_id, amount } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!voucher_id || !fee_type_id || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid input data" });
    }

    const query = `
      INSERT INTO fee_voucher_details (voucher_id, fee_type_id, amount)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [voucher_id, fee_type_id, amount];
    const result = await client.query(query, values);

    await updateVoucherStatus(voucher_id, client);

    await client.query("COMMIT");
    res
      .status(201)
      .json({
        data: result.rows[0],
        message: "Fee voucher detail created successfully",
      });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating fee voucher detail:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

export const updateFeeVoucherDetail = async (req, res) => {
  const { id } = req.params;
  const { voucher_id, fee_type_id, amount } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!voucher_id || !fee_type_id || !amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid input data" });
    }

    const query = `
      UPDATE fee_voucher_details
      SET voucher_id = $1, fee_type_id = $2, amount = $3, created_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const values = [voucher_id, fee_type_id, amount, id];
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Fee voucher detail not found" });
    }

    await updateVoucherStatus(voucher_id, client);

    await client.query("COMMIT");
    res
      .status(200)
      .json({
        data: result.rows[0],
        message: "Fee voucher detail updated successfully",
      });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating fee voucher detail:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

export const deleteFeeVoucherDetail = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const voucherQuery = await client.query(
      `SELECT voucher_id 
            FROM fee_voucher_details 
            WHERE id = $1`,
      [id]
    );

    if (voucherQuery.rows.length === 0) {
      return res.status(404).json({ error: "Fee voucher detail not found" });
    }

    const voucher_id = voucherQuery.rows[0].voucher_id;

    const query = `DELETE FROM fee_voucher_details WHERE id = $1 RETURNING *;`;
    const result = await client.query(query, [id]);

    await updateVoucherStatus(voucher_id, client);

    await client.query("COMMIT");
    res.json({ message: "Fee voucher detail deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting fee voucher detail:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};
