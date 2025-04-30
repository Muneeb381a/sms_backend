import { pool } from "../config/db.js";
import PDFDocument from "pdfkit";
import { format, addMonths } from "date-fns";

// Generate monthly fee vouchers for all students or a specific class
export const generateMonthlyFees = async (req, res) => {
  const { class_id, academic_year, month } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validate inputs
    if (!academic_year || !month) {
      return res
        .status(400)
        .json({ error: "Academic year and month are required" });
    }

    // Validate academic_year format (e.g., 2024-2025)
    if (!/^\d{4}-\d{4}$/.test(academic_year)) {
      return res
        .status(400)
        .json({ error: "Academic year must be in YYYY-YYYY format" });
    }

    // Validate month (1-12)
    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "Month must be between 1 and 12" });
    }

    // Calculate due date (end of the specified month)
    const year = parseInt(academic_year.split("-")[0]);
    const dueDate = new Date(year, month, 0); // Last day of the month

    // Get students (either from a specific class or all students)
    let studentsQuery = `
      SELECT s.id, s.first_name, s.last_name, s.class_id
      FROM students s
    `;
    let studentsParams = [];
    if (class_id) {
      studentsQuery += ` WHERE s.class_id = $1`;
      studentsParams.push(class_id);
    }

    const studentsResult = await client.query(studentsQuery, studentsParams);
    if (studentsResult.rows.length === 0) {
      return res.status(404).json({ error: "No students found" });
    }

    const vouchers = [];
    for (const student of studentsResult.rows) {
      // Get applicable fee structures for the student's class
      const feeStructures = await client.query(
        `
        SELECT fs.*, ft.name AS fee_type
        FROM fee_structures fs
        JOIN fee_types ft ON fs.fee_type_id = ft.id
        WHERE fs.class_id = $1 AND fs.academic_year = $2 AND fs.frequency = 'monthly'
        `,
        [student.class_id, academic_year]
      );

      if (feeStructures.rows.length === 0) {
        continue; // Skip if no monthly fee structures for this class
      }

      // Check if voucher already exists for this student and month
      const existingVoucher = await client.query(
        `
        SELECT id
        FROM fee_vouchers
        WHERE student_id = $1 AND EXTRACT(MONTH FROM due_date) = $2 AND EXTRACT(YEAR FROM due_date) = $3
        `,
        [student.id, month, year]
      );

      if (existingVoucher.rows.length > 0) {
        continue; // Skip if voucher already exists
      }

      // Create new fee voucher
      const voucherResult = await client.query(
        `
        INSERT INTO fee_vouchers (student_id, due_date, status, paid_amount)
        VALUES ($1, $2, 'pending', 0)
        RETURNING *
        `,
        [student.id, dueDate]
      );

      const voucher = voucherResult.rows[0];

      // Create fee voucher details
      for (const fee of feeStructures.rows) {
        await client.query(
          `
          INSERT INTO fee_voucher_details (voucher_id, fee_type_id, amount)
          VALUES ($1, $2, $3)
          `,
          [voucher.id, fee.fee_type_id, fee.amount]
        );
      }

      // Update voucher status
      await client.query(
        `
        UPDATE fee_vouchers
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [voucher.id]
      );

      vouchers.push({
        voucher_id: voucher.id,
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        due_date: voucher.due_date,
        total_amount: feeStructures.rows.reduce(
          (sum, fee) => sum + parseFloat(fee.amount),
          0
        ),
      });
    }

    await client.query("COMMIT");
    res.status(201).json({
      data: vouchers,
      message: "Monthly fee vouchers generated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error generating monthly fees:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Generate PDF for all vouchers of a class or all students
export const generateBulkVoucherPDF = async (req, res) => {
  const { class_id, academic_year, month } = req.query;
  const client = await pool.connect();

  try {
    // Validate inputs
    if (!academic_year || !month) {
      return res
        .status(400)
        .json({ error: "Academic year and month are required" });
    }

    // Validate academic_year format
    if (!/^\d{4}-\d{4}$/.test(academic_year)) {
      return res
        .status(400)
        .json({ error: "Academic year must be in YYYY-YYYY format" });
    }

    // Validate month
    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "Month must be between 1 and 12" });
    }

    const year = parseInt(academic_year.split("-")[0]);

    // Get vouchers
    let vouchersQuery = `
      SELECT fv.*, s.first_name, s.last_name
      FROM fee_vouchers fv
      JOIN students s ON fv.student_id = s.id
      WHERE EXTRACT(MONTH FROM fv.due_date) = $1 AND EXTRACT(YEAR FROM fv.due_date) = $2
    `;
    let vouchersParams = [month, year];

    if (class_id) {
      vouchersQuery += ` AND s.class_id = $3`;
      vouchersParams.push(class_id);
    }

    const vouchersResult = await client.query(vouchersQuery, vouchersParams);
    if (vouchersResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No vouchers found for the specified criteria" });
    }

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bulk-vouchers-${academic_year}-month-${month}.pdf`
    );
    doc.pipe(res);

    for (let i = 0; i < vouchersResult.rows.length; i++) {
      const voucher = vouchersResult.rows[i];

      // Add new page for each voucher (except first)
      if (i > 0) {
        doc.addPage();
      }

      // Fetch fee details
      const detailsResult = await client.query(
        `
        SELECT fvd.*, ft.name AS fee_type
        FROM fee_voucher_details fvd
        JOIN fee_types ft ON fvd.fee_type_id = ft.id
        WHERE fvd.voucher_id = $1
        `,
        [voucher.id]
      );

      const total = detailsResult.rows.reduce(
        (sum, detail) => sum + parseFloat(detail.amount),
        0
      );

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
    }

    doc.end();
  } catch (error) {
    console.error("Error generating bulk PDF:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};
