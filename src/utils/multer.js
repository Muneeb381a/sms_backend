import multer from "multer";

// Configure storage to keep files in memory
const storage = multer.memoryStorage();

// File filter to allow only JPEG, PNG, and PDF files
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new Error("Only JPEG, PNG, and PDF files are allowed"), false); // Reject the file
  }
};

// Configure Multer to handle multiple file fields
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
}).fields([
  { name: "image", maxCount: 1 }, // Single image file
  { name: "pdf", maxCount: 1 }, // Single PDF file
]);

export default upload;
