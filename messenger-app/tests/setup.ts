// Global test setup
import { vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port in tests
