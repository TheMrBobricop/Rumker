import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
    'image/svg+xml',
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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            // Accept the file anyway but log a warning — don't reject
            console.warn(`Unusual file type uploaded: ${file.mimetype} (${file.originalname})`);
            cb(null, true);
        }
    },
});

async function trySupabaseUpload(file: Express.Multer.File, userId: string) {
    try {
        const { supabase } = await import('../lib/supabase.js');

        const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = `uploads/${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file.buffer, {
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
    const filePath = path.join(userDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    return `/uploads/${userId}/${fileName}`;
}

// Main upload handler
router.post('/', authenticateToken, (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req as any, res, (err: any) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ message: 'File too large. Maximum size is 1GB' });
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

        const userId = req.user?.userId || 'anonymous';

        // Try Supabase first, fall back to local storage
        let url = await trySupabaseUpload(file, userId);

        if (!url) {
            url = saveLocally(file, userId);
            console.log(`File saved locally: ${url}`);
        }

        res.json({
            url,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
        });
    } catch (error) {
        console.error('Upload handler error:', error);
        res.status(500).json({ message: 'Failed to upload file' });
    }
});

export default router;
