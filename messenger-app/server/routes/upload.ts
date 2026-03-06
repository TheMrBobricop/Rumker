import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadLimiter, sanitizeFilename } from '../lib/security.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    // Video
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/ogg',
    'video/3gpp',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/mpeg',
    // Audio
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
    // Documents
    'application/pdf',
    'application/zip',
    'application/x-rar-compressed',
];

const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const tmpDir = path.resolve(__dirname, '../../uploads/.tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        cb(null, tmpDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.warn(`Rejected file type: ${file.mimetype} (${file.originalname})`);
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    },
});

async function trySupabaseUpload(file: Express.Multer.File, userId: string) {
    try {
        const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = `uploads/${userId}/${fileName}`;

        const fileBuffer = await fs.promises.readFile(file.path);
        const { error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, fileBuffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (uploadError) {
            console.warn('Supabase storage upload failed:', uploadError.message);
            return null;
        }

        const { data: publicUrlData } = supabase.storage
            .from('chat-media')
            .getPublicUrl(filePath);

        // Clean up tmp file after successful Supabase upload
        try { fs.unlinkSync(file.path); } catch {}
        return publicUrlData.publicUrl;
    } catch (err) {
        console.warn('Supabase storage unavailable, using local storage');
        return null;
    }
}

function saveLocally(file: Express.Multer.File, userId: string): string {
    const userDir = path.join(UPLOADS_DIR, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
    const fileName = `${crypto.randomUUID()}${ext}`;
    const destPath = path.join(userDir, fileName);

    // Move from tmp to final location (disk-to-disk, no memory spike)
    fs.renameSync(file.path, destPath);

    return `/uploads/${userId}/${fileName}`;
}

// Main upload handler
router.post('/', authenticateToken, uploadLimiter, (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req as any, res, (err: any) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ message: 'File too large. Maximum size is 50MB' });
            }
            console.error('Multer error:', err);
            return res.status(400).json({ message: err.message || 'File upload error' });
        }
        next();
    });
}, async (req: AuthRequest, res: Response) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ message: 'No file provided' });
        }

        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Try Supabase first, fall back to local storage
        let url = await trySupabaseUpload(file, userId);

        if (!url) {
            url = saveLocally(file, userId);
            console.log(`File saved locally: ${url}`);
        }

        res.json({
            url,
            fileName: sanitizeFilename(file.originalname),
            mimeType: file.mimetype,
            size: file.size,
        });
    } catch (error) {
        console.error('Upload handler error:', error);
        res.status(500).json({ message: 'Failed to upload file' });
    }
});

export default router;
