import { z } from 'zod';
import { type Request, type Response, type NextFunction } from 'express';

// ============================================================
// Common schemas
// ============================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidSchema = z.string().regex(UUID_REGEX, 'Invalid UUID format');

// ============================================================
// Auth schemas
// ============================================================

export const registerSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores'),
    email: z.string().email(),
    password: z.string().min(6).max(128),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

export const loginEmailSchema = z.object({
    email: z.string().min(1).max(200).optional(),
    userId: z.string().min(1).max(100).optional(),
    password: z.string().min(1).max(128),
}).refine((data) => !!data.email || !!data.userId, {
    message: 'Email or userId is required',
    path: ['email'],
});

export const sendCodeSchema = z.object({
    phoneNumber: z.string().min(5).max(20),
});

export const signInSchema = z.object({
    phoneNumber: z.string().min(5).max(20),
    phoneCodeHash: z.string().min(1).max(100),
    phoneCode: z.string().min(1).max(10),
    password: z.string().optional(),
});

export const checkPasswordSchema = z.object({
    phoneNumber: z.string().min(5).max(20),
    password: z.string().min(1).max(256),
});

// ============================================================
// Reactions schemas
// ============================================================

export const reactionSchema = z.object({
    emoji: z.string().min(1).max(10),
});

// ============================================================
// Chat schemas
// ============================================================

export const createChatSchema = z.object({
    type: z.enum(['private', 'group', 'channel']).default('private'),
    name: z.string().max(100).optional().nullable(),
    title: z.string().max(100).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    avatar: z.string().max(500).optional().nullable(),
    participantIds: z.array(uuidSchema).optional(),
});

export const createPrivateChatSchema = z.object({
    userId: uuidSchema,
});

export const updateChatSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    avatar: z.string().max(500).optional().nullable(),
});

export const sendMessageSchema = z.object({
    content: z.string().max(4096).optional().default(''),
    type: z.enum(['text', 'image', 'video', 'voice', 'file', 'sticker', 'poll', 'location', 'contact', 'forward', 'audio']).default('text'),
    fileUrl: z.string().max(2000).optional(),
    replyToId: uuidSchema.optional(),
    forwardedFromId: uuidSchema.optional(),
    forwardedFromName: z.string().max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
});

export const editMessageSchema = z.object({
    content: z.string().min(1).max(4096),
});

export const markReadSchema = z.object({
    messageId: uuidSchema,
});

export const addMembersSchema = z.object({
    userIds: z.array(uuidSchema).min(1).max(50),
});

// ============================================================
// Friends schemas
// ============================================================

export const friendRequestSchema = z.object({
    username: z.string().min(1).max(30),
    message: z.string().max(200).optional().nullable(),
});

// ============================================================
// Users schemas
// ============================================================

export const updateProfileSchema = z.object({
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    bio: z.string().max(500).optional(),
    avatar: z.string().max(500).optional().nullable(),
});

export const searchQuerySchema = z.object({
    query: z.string().max(200).optional().default(''),
});

// ============================================================
// Polls schemas
// ============================================================

export const createPollSchema = z.object({
    chatId: uuidSchema,
    question: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(100)).min(2).max(10),
    isAnonymous: z.boolean().default(false),
    isMultipleChoice: z.boolean().default(false),
});

export const voteSchema = z.object({
    optionIds: z.array(uuidSchema).min(1).max(10),
});

// ============================================================
// Voice channels schemas
// ============================================================

export const createVoiceChannelSchema = z.object({
    chatId: uuidSchema,
    name: z.string().min(1).max(50),
    description: z.string().max(200).optional().nullable(),
    category: z.string().max(50).default('general'),
    maxParticipants: z.number().int().min(1).max(100).default(50),
    isLocked: z.boolean().default(false),
});

export const updateVoiceChannelSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(200).optional().nullable(),
});

export const renameCategorySchema = z.object({
    chatId: uuidSchema,
    oldName: z.string().min(1).max(50),
    newName: z.string().min(1).max(50),
});

export const deleteCategorySchema = z.object({
    chatId: uuidSchema,
    category: z.string().min(1).max(50),
});

export const reorderCategoriesSchema = z.object({
    chatId: uuidSchema,
    categoryOrder: z.array(z.object({
        category: z.string().min(1).max(50),
        position: z.number().int().min(0),
    })).min(1).max(50),
});

export const reorderChannelsSchema = z.object({
    chatId: uuidSchema,
    channels: z.array(z.object({
        id: uuidSchema,
        position: z.number().int().min(0),
        category: z.string().min(1).max(50),
    })).min(1).max(100),
});

// ============================================================
// Admin rights schemas
// ============================================================

export const adminRightsSchema = z.object({
    can_change_info: z.boolean().default(false),
    can_delete_messages: z.boolean().default(false),
    can_ban_users: z.boolean().default(false),
    can_invite_users: z.boolean().default(false),
    can_pin_messages: z.boolean().default(false),
    can_promote_members: z.boolean().default(false),
    can_manage_voice_channels: z.boolean().default(false),
});

export const updateMemberRoleSchema = z.object({
    role: z.enum(['admin', 'member']),
    title: z.string().max(64).optional().nullable(),
    adminRights: adminRightsSchema.optional(),
});

export const updateMemberTitleSchema = z.object({
    title: z.string().max(64).nullable(),
});

// ============================================================
// Query param schemas
// ============================================================

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

export const mediaTypeSchema = z.object({
    type: z.enum(['image', 'video', 'file', 'voice']).default('image'),
});

// ============================================================
// Middleware: validate request body with Zod
// ============================================================

export function validateBody<T extends z.ZodType>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const issues = result.error.issues ?? result.error.errors ?? [];
            const errors = issues.map((e: any) => ({
                field: (e.path ?? []).join('.'),
                message: e.message,
            }));
            return res.status(400).json({
                error: 'Validation error',
                details: errors,
            });
        }
        req.body = result.data;
        next();
    };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const issues = result.error.issues ?? result.error.errors ?? [];
            const errors = issues.map((e: any) => ({
                field: (e.path ?? []).join('.'),
                message: e.message,
            }));
            return res.status(400).json({
                error: 'Validation error',
                details: errors,
            });
        }
        // Merge validated data back to query
        Object.assign(req.query, result.data);
        next();
    };
}

export function validateParams<T extends z.ZodType>(schema: T) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            const issues = result.error.issues ?? result.error.errors ?? [];
            return res.status(400).json({
                error: 'Invalid parameters',
                details: issues.map((e: any) => ({
                    field: (e.path ?? []).join('.'),
                    message: e.message,
                })),
            });
        }
        next();
    };
}

// UUID param validator (reusable for :chatId, :messageId, etc.)
export const validateUuidParam = (paramName: string) =>
    validateParams(z.object({ [paramName]: uuidSchema }));
