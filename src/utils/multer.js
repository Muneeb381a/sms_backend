import multer from "multer";

const storage = multer.memoryStorage();

// file filter to allow only images

const fileFilter = (req, res, next) => {
    const allowedTypes = ["image/jpeg", "image/png", 'application/pdf'];
    if(allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only jpeg, png, and pdf files are allowed"), false)
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {fileSize: 5 * 1024 * 1024},
}).fields([
    {name: "image", maxCount: 1},
    {name: "pdf", maxCount: 1}
]);


export default upload;