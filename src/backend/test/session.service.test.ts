import { describe, it, expect, jest } from '@jest/globals';

// Mock DB and schema
const mockDb = {
  select: jest.fn<any>().mockReturnThis(),
  from: jest.fn<any>().mockReturnThis(),
  where: jest.fn<any>().mockReturnThis(),
  limit: jest.fn<any>()
};

jest.unstable_mockModule('../config/db.js', () => ({
  db: mockDb
}));

jest.unstable_mockModule('../config/schema.js', () => ({
  waSessions: {
    userId: 'userId',
    sessionId: 'sessionId'
  }
}));

const { isSessionAllowedForUser } = await import('../service/session.service.js');

describe('session.service', () => {
  describe('isSessionAllowedForUser', () => {
    it('should return true if user is admin', async () => {
      const user = { role: 'admin' };
      const result = await isSessionAllowedForUser(user as any, 'session-123');
      expect(result).toBe(true);
    });

    it('should return true if session is found for user', async () => {
      const user = { role: 'user', id: '1' };
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]);
      
      const result = await isSessionAllowedForUser(user as any, 'session-123');
      expect(result).toBe(true);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return false if session is not found for user', async () => {
      const user = { role: 'user', id: '1' };
      mockDb.limit.mockResolvedValueOnce([]);
      
      const result = await isSessionAllowedForUser(user as any, 'session-123');
      expect(result).toBe(false);
    });
  });
});
