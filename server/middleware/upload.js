const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images, pdfs, docs, text, audio recordings, spreadsheets
  const allowedExtensions = /jpeg|jpg|png|webp|gif|pdf|doc|docx|txt|csv|xlsx|xls|webm|mp3|wav|ogg|m4a|aac|opus/;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (allowedExtensions.test(ext) || file.mimetype?.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only images, PDFs, audio recordings, and office documents are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: fileFilter
});

module.exports = upload;
