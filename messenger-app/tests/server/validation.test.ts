import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the validation schemas we'll create
// For now, define them inline matching what we'll add to routes

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidSchema = z.string().regex(UUID_REGEX, 'Invalid UUID format');

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric'),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const createChatSchema = z.object({
  type: z.enum(['private', 'group', 'channel']).default('private'),
  name: z.string().max(100).optional(),
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  participantIds: z.array(uuidSchema).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().max(4096).optional(),
  type: z.enum(['text', 'image', 'video', 'voice', 'file', 'sticker', 'poll', 'location', 'contact', 'forward']).default('text'),
  fileUrl: z.string().optional(),
  replyToId: uuidSchema.optional(),
  forwardedFromId: uuidSchema.optional(),
  forwardedFromName: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(4096),
});

const friendRequestSchema = z.object({
  username: z.string().min(1).max(30),
  message: z.string().max(200).optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional().nullable(),
});

const createPollSchema = z.object({
  chatId: uuidSchema,
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(100)).min(2).max(10),
  isAnonymous: z.boolean().default(false),
  isMultipleChoice: z.boolean().default(false),
});

const voteSchema = z.object({
  optionIds: z.array(uuidSchema).min(1).max(10),
});

const createVoiceChannelSchema = z.object({
  chatId: uuidSchema,
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  category: z.string().max(50).default('general'),
  maxParticipants: z.number().int().min(1).max(100).default(50),
  isLocked: z.boolean().default(false),
});

describe('Registration Validation', () => {
  it('should accept valid registration data', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject username shorter than 3 chars', () => {
    const result = registerSchema.safeParse({
      username: 'ab',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject username with special chars', () => {
    const result = registerSchema.safeParse({
      username: 'test<script>',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'not-an-email',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject mismatched passwords', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'different',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 6 chars', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: '12345',
      confirmPassword: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password longer than 128 chars', () => {
    const longPassword = 'a'.repeat(129);
    const result = registerSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: longPassword,
      confirmPassword: longPassword,
    });
    expect(result.success).toBe(false);
  });
});

describe('Login Validation', () => {
  it('should accept valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('Create Chat Validation', () => {
  it('should accept valid group chat', () => {
    const result = createChatSchema.safeParse({
      type: 'group',
      name: 'Test Group',
      participantIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid chat type', () => {
    const result = createChatSchema.safeParse({
      type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 100 chars', () => {
    const result = createChatSchema.safeParse({
      type: 'group',
      name: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID in participantIds', () => {
    const result = createChatSchema.safeParse({
      type: 'group',
      participantIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('Send Message Validation', () => {
  it('should accept valid text message', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello world',
      type: 'text',
    });
    expect(result.success).toBe(true);
  });

  it('should reject message longer than 4096 chars', () => {
    const result = sendMessageSchema.safeParse({
      content: 'a'.repeat(4097),
      type: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('should accept message with valid replyToId', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Reply',
      replyToId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject message with invalid replyToId', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Reply',
      replyToId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('Edit Message Validation', () => {
  it('should accept valid edit', () => {
    const result = editMessageSchema.safeParse({ content: 'Updated text' });
    expect(result.success).toBe(true);
  });

  it('should reject empty content', () => {
    const result = editMessageSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('should reject content over 4096 chars', () => {
    const result = editMessageSchema.safeParse({ content: 'a'.repeat(4097) });
    expect(result.success).toBe(false);
  });
});

describe('Friend Request Validation', () => {
  it('should accept valid request', () => {
    const result = friendRequestSchema.safeParse({ username: 'john' });
    expect(result.success).toBe(true);
  });

  it('should accept request with message', () => {
    const result = friendRequestSchema.safeParse({
      username: 'john',
      message: 'Hey, lets be friends!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty username', () => {
    const result = friendRequestSchema.safeParse({ username: '' });
    expect(result.success).toBe(false);
  });

  it('should reject message over 200 chars', () => {
    const result = friendRequestSchema.safeParse({
      username: 'john',
      message: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('Profile Update Validation', () => {
  it('should accept valid profile update', () => {
    const result = updateProfileSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      bio: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('should reject bio over 500 chars', () => {
    const result = updateProfileSchema.safeParse({
      bio: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should accept null avatar (for removal)', () => {
    const result = updateProfileSchema.safeParse({
      avatar: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('Create Poll Validation', () => {
  it('should accept valid poll', () => {
    const result = createPollSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      question: 'What do you prefer?',
      options: ['Option A', 'Option B'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject poll with less than 2 options', () => {
    const result = createPollSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      question: 'What?',
      options: ['Only one'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject poll with more than 10 options', () => {
    const result = createPollSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      question: 'What?',
      options: Array.from({ length: 11 }, (_, i) => `Option ${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty question', () => {
    const result = createPollSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      question: '',
      options: ['A', 'B'],
    });
    expect(result.success).toBe(false);
  });
});

describe('Vote Validation', () => {
  it('should accept valid vote', () => {
    const result = voteSchema.safeParse({
      optionIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty optionIds', () => {
    const result = voteSchema.safeParse({ optionIds: [] });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID in optionIds', () => {
    const result = voteSchema.safeParse({ optionIds: ['not-uuid'] });
    expect(result.success).toBe(false);
  });
});

describe('Voice Channel Validation', () => {
  it('should accept valid channel', () => {
    const result = createVoiceChannelSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'General',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = createVoiceChannelSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject maxParticipants over 100', () => {
    const result = createVoiceChannelSchema.safeParse({
      chatId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test',
      maxParticipants: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('UUID Validation', () => {
  it('should accept valid UUID v4', () => {
    const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716').success).toBe(false);
  });

  it('should reject SQL injection in UUID', () => {
    expect(uuidSchema.safeParse("'; DROP TABLE users; --").success).toBe(false);
  });

  it('should reject XSS in UUID', () => {
    expect(uuidSchema.safeParse('<script>alert(1)</script>').success).toBe(false);
  });
});
