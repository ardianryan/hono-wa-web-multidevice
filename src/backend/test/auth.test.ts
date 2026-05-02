import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock DB and dependencies ─────────────────────────────────────────────────
const mockInsert = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockDelete = jest.fn<any>();
const mockSelect = jest.fn<any>();
const mockValues = jest.fn<any>();
const mockSet = jest.fn<any>();
const mockWhere = jest.fn<any>();
const mockReturning = jest.fn<any>();
const mockFrom = jest.fn<any>();

const mockDb = { insert: mockInsert, update: mockUpdate, delete: mockDelete, select: mockSelect };
const mockGetSetting = jest.fn<any>();
const mockSetSetting = jest.fn<any>();

jest.unstable_mockModule('../config/db.js', () => ({
  db: mockDb,
  getSetting: mockGetSetting,
  setSetting: mockSetSetting,
}));
jest.unstable_mockModule('../config/schema.js', () => ({
  users: { id: 'id', role: 'role', username: 'username' },
  authSessions: { id: 'id', userId: 'userId', expiresAt: 'expiresAt' },
  waSessions: { id: 'id', userId: 'userId', sessionId: 'sessionId' },
  actionLogs: { id: 'id', userId: 'userId', actionType: 'actionType', sessionId: 'sessionId' },
}));

// Drizzle-orm operators are used directly — mock them to be identity
jest.unstable_mockModule('drizzle-orm', () => ({
  eq: jest.fn((a: any, b: any) => ({ eq: [a, b] })),
  and: jest.fn((...args: any[]) => ({ and: args })),
  desc: jest.fn((a: any) => ({ desc: a })),
  gt: jest.fn((a: any, b: any) => ({ gt: [a, b] })),
  inArray: jest.fn((a: any, b: any) => ({ inArray: [a, b] })),
}));

const { hashPassword, verifyPassword, generateApiKey, hashApiKey, getMaintenanceMode, setMaintenanceMode, getAppName, getMediaMaxMb } = await import('../utils/auth.js');

// ─── Tests: Pure crypto functions ────────────────────────────────────────────

describe('auth — hashPassword & verifyPassword', () => {
  it('returns true when verifying against its own hash', async () => {
    const hash = await hashPassword('my-secure-password');
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('scrypt$')).toBe(true);
    const valid = await verifyPassword('my-secure-password', hash);
    expect(valid).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correct-password');
    const valid = await verifyPassword('wrong-password', hash);
    expect(valid).toBe(false);
  });

  it('returns false for a malformed hash (wrong algorithm)', async () => {
    const valid = await verifyPassword('password', 'bcrypt$invalidhash');
    expect(valid).toBe(false);
  });

  it('returns false for a hash with missing segments', async () => {
    const valid = await verifyPassword('password', 'scrypt$16384');
    expect(valid).toBe(false);
  });

  it('generates unique hashes for the same password (due to salt)', async () => {
    const hash1 = await hashPassword('password');
    const hash2 = await hashPassword('password');
    expect(hash1).not.toBe(hash2);
    // But both verify correctly
    expect(await verifyPassword('password', hash1)).toBe(true);
    expect(await verifyPassword('password', hash2)).toBe(true);
  });
});

describe('auth — generateApiKey & hashApiKey', () => {
  it('generates a non-empty string', () => {
    const key = generateApiKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);
  });

  it('generates unique keys each call', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });

  it('produces a deterministic SHA-256 hash', () => {
    const key = 'my-api-key';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key).length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('key-one')).not.toBe(hashApiKey('key-two'));
  });
});

describe('auth — getMaintenanceMode & setMaintenanceMode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false when setting is not "true"', async () => {
    mockGetSetting.mockResolvedValue(null);
    expect(await getMaintenanceMode()).toBe(false);
    mockGetSetting.mockResolvedValue('false');
    expect(await getMaintenanceMode()).toBe(false);
  });

  it('returns true when setting is "true"', async () => {
    mockGetSetting.mockResolvedValue('true');
    expect(await getMaintenanceMode()).toBe(true);
  });

  it('calls setSetting with "true" when enabling', async () => {
    mockSetSetting.mockResolvedValue(undefined);
    await setMaintenanceMode(true);
    expect(mockSetSetting).toHaveBeenCalledWith('maintenance_mode', 'true');
  });

  it('calls setSetting with "false" when disabling', async () => {
    mockSetSetting.mockResolvedValue(undefined);
    await setMaintenanceMode(false);
    expect(mockSetSetting).toHaveBeenCalledWith('maintenance_mode', 'false');
  });
});

describe('auth — getAppName', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the stored app name', async () => {
    mockGetSetting.mockResolvedValue('MyAppName');
    expect(await getAppName()).toBe('MyAppName');
  });

  it('returns default "HonoWA" when setting is null', async () => {
    mockGetSetting.mockResolvedValue(null);
    expect(await getAppName()).toBe('HonoWA');
  });
});

describe('auth — getMediaMaxMb', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns stored value when valid', async () => {
    mockGetSetting.mockResolvedValue('25');
    expect(await getMediaMaxMb()).toBe(25);
  });

  it('returns 10 when setting is null or invalid', async () => {
    mockGetSetting.mockResolvedValue(null);
    expect(await getMediaMaxMb()).toBe(10);
    mockGetSetting.mockResolvedValue('not-a-number');
    expect(await getMediaMaxMb()).toBe(10);
  });

  it('clamps value between 1 and 100', async () => {
    mockGetSetting.mockResolvedValue('999');
    expect(await getMediaMaxMb()).toBe(100);
    mockGetSetting.mockResolvedValue('0');
    expect(await getMediaMaxMb()).toBe(10);
  });
});
