import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Multer for soundboard uploads (512KB max, audio only)
const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const userId = (req as AuthRequest).user?.userId || 'unknown';
        const dir = path.join(process.cwd(), 'uploads', 'soundboard', userId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp3';
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 512 * 1024 }, // 512KB
    fileFilter: (_req, file, cb) => {
        const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files (MP3, WAV, OGG, WebM) are allowed'));
        }
    },
});

// GET /soundboard?chatId=xxx — list sounds for a chat
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const chatId = req.query.chatId as string;
        if (!chatId) return res.status(400).json({ error: 'chatId required' });

        const { data, error } = await supabase
            .from('soundboard_sounds')
            .select('id, chat_id, name, category, file_url, duration_ms, uploaded_by, is_default, created_at')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        const sounds = (data || []).map((s: any) => ({
            id: s.id,
            chatId: s.chat_id,
            name: s.name,
            category: s.category || 'default',
            fileUrl: s.file_url,
            durationMs: s.duration_ms,
            uploadedBy: s.uploaded_by,
            isDefault: s.is_default || false,
            createdAt: s.created_at,
        }));

        res.json(sounds);
    } catch (err) {
        console.error('[Soundboard] GET error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /soundboard — upload a custom sound
router.post('/', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const chatId = req.body.chatId;
        const name = req.body.name || 'Sound';
        const durationMs = parseInt(req.body.durationMs || '0', 10);

        if (!chatId) return res.status(400).json({ error: 'chatId required' });
        if (durationMs > 5000) return res.status(400).json({ error: 'Max duration is 5 seconds' });

        // Build the file URL
        const relativePath = `/uploads/soundboard/${userId}/${file.filename}`;

        const { data, error } = await supabase
            .from('soundboard_sounds')
            .insert({
                chat_id: chatId,
                name: name.slice(0, 100),
                category: req.body.category || 'custom',
                file_url: relativePath,
                duration_ms: durationMs,
                uploaded_by: userId,
                is_default: false,
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        res.json({
            id: data.id,
            chatId: data.chat_id,
            name: data.name,
            category: data.category,
            fileUrl: data.file_url,
            durationMs: data.duration_ms,
            uploadedBy: data.uploaded_by,
            isDefault: false,
            createdAt: data.created_at,
        });
    } catch (err) {
        console.error('[Soundboard] POST error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /soundboard/:soundId — delete a custom sound
router.delete('/:soundId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const soundId = req.params.soundId;

        // Check ownership
        const { data: sound } = await supabase
            .from('soundboard_sounds')
            .select('id, uploaded_by, file_url')
            .eq('id', soundId)
            .single();

        if (!sound) return res.status(404).json({ error: 'Sound not found' });
        if (sound.uploaded_by !== userId) return res.status(403).json({ error: 'Not the owner' });

        // Delete file
        if (sound.file_url) {
            const filePath = path.join(process.cwd(), sound.file_url);
            fs.unlink(filePath, () => {}); // best effort
        }

        // Delete from DB
        const { error } = await supabase
            .from('soundboard_sounds')
            .delete()
            .eq('id', soundId);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        console.error('[Soundboard] DELETE error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /soundboard/:soundId/favorite — toggle favorite
router.post('/:soundId/favorite', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const soundId = req.params.soundId;

        // Check if already favorited
        const { data: existing } = await supabase
            .from('soundboard_favorites')
            .select('user_id')
            .eq('user_id', userId)
            .eq('sound_id', soundId)
            .single();

        if (existing) {
            await supabase
                .from('soundboard_favorites')
                .delete()
                .eq('user_id', userId)
                .eq('sound_id', soundId);
            res.json({ favorited: false });
        } else {
            await supabase
                .from('soundboard_favorites')
                .insert({ user_id: userId, sound_id: soundId });
            res.json({ favorited: true });
        }
    } catch (err) {
        console.error('[Soundboard] Favorite error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
