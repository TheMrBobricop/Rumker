import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';
import { uploadLimiter, sanitizeFilename } from '../lib/security.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

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

const upload = multer({
    // Keep files purely in memory; nothing touches server filesystem
    storage: multer.memoryStorage(),
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

async function uploadToSupabase(file: Express.Multer.File, userId: string) {
    try {
        const ext =
            file.originalname.includes('.')
                ? file.originalname.slice(file.originalname.lastIndexOf('.'))
                : `.${file.mimetype.split('/')[1]}`;
        const fileName = `${crypto.randomUUID()}${ext}`;
        const filePath = `uploads/${userId}/${fileName}`;

        if (!file.buffer) {
            throw new Error('Upload buffer missing');
        }
        const { error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (uploadError) {
            console.warn('Supabase storage upload failed:', uploadError.message);
            throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
            .from('chat-media')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    } catch (err) {
        console.warn('Supabase storage unavailable:', err);
        throw err;
    }
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

        // Upload strictly to Supabase; if unavailable, fail (no local disk storage)
        const url = await uploadToSupabase(file, userId);

        res.json({
            url,
            fileName: sanitizeFilename(file.originalname),
            mimeType: file.mimetype,
            size: file.size,
        });
    } catch (error) {
        console.error('Upload handler error:', error);
        res.status(503).json({ message: 'Media storage unavailable. Please retry later.' });
    }
});

export default router;
