import multer from "multer";

// Configure storage to keep files in memory for Cloudinary uploads
const storage = multer.memoryStorage();

// File filter to allow only JPEG, PNG, and PDF files
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and PDF files are allowed.`), false); // Reject the file
  }
};

// Configure Multer to handle specific file fields for student and teacher uploads
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
}).fields([
  { name: "image", maxCount: 1 }, // Single JPEG/PNG photo (used for student/teacher photos)
  { name: "pdf", maxCount: 1 },   // Single PDF document (used for teacher resumes or student documents)
]);

export default upload;