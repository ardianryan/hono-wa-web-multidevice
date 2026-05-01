import { describe, it, expect, jest } from '@jest/globals';

// Mock session manager before importing the service
jest.unstable_mockModule('../session/session-manager.js', () => ({
  sessions: new Map(),
  getOrCreateSession: jest.fn(),
}));

const { 
  toHistoryActionType, 
  historyBasePath, 
  historyPathWithSession, 
  collectMessageIds, 
  isWithinUnsendWindow, 
  jsonToCsv, 
  UNSEND_WINDOW_MS 
} = await import('../service/message.service.js');

describe('message.service', () => {
  describe('toHistoryActionType', () => {
    it('should return the correct type for valid inputs', () => {
      expect(toHistoryActionType('broadcast')).toBe('broadcast');
      expect(toHistoryActionType('status')).toBe('status');
      expect(toHistoryActionType('message')).toBe('message');
    });

    it('should fallback to message for invalid inputs', () => {
      expect(toHistoryActionType('invalid')).toBe('message');
      expect(toHistoryActionType('')).toBe('message');
    });
  });

  describe('historyBasePath', () => {
    it('should return correct base paths', () => {
      expect(historyBasePath('broadcast')).toBe('/admin/broadcast');
      expect(historyBasePath('status')).toBe('/admin/status');
      expect(historyBasePath('message')).toBe('/admin/message');
    });
  });

  describe('historyPathWithSession', () => {
    it('should return base path if no session id', () => {
      expect(historyPathWithSession('broadcast')).toBe('/admin/broadcast');
      expect(historyPathWithSession('message', '  ')).toBe('/admin/message');
    });

    it('should append sessionId to path', () => {
      expect(historyPathWithSession('broadcast', '123')).toBe('/admin/broadcast?sessionId=123');
    });
  });

  describe('collectMessageIds', () => {
    it('should collect direct sentMessageIds', () => {
      const payload = { sentMessageIds: ['id1', 'id2'] };
      expect(collectMessageIds(payload)).toEqual(['id1', 'id2']);
    });

    it('should collect nested messageIds from sentItems', () => {
      const payload = {
        sentItems: [
          { messageIds: ['id1', 'id2'] },
          { messageIds: ['id3'] },
        ]
      };
      expect(collectMessageIds(payload)).toEqual(['id1', 'id2', 'id3']);
    });

    it('should combine direct and nested and filter duplicates and empty', () => {
      const payload = {
        sentMessageIds: ['id1', '', 'id2'],
        sentItems: [
          { messageIds: ['id2', 'id3'] },
        ]
      };
      expect(collectMessageIds(payload)).toEqual(['id1', 'id2', 'id3']);
    });
  });

  describe('isWithinUnsendWindow', () => {
    it('should return false for invalid dates', () => {
      expect(isWithinUnsendWindow(null)).toBe(false);
      expect(isWithinUnsendWindow('invalid')).toBe(false);
    });

    it('should return true for recent dates', () => {
      const recent = new Date(Date.now() - 1000).toISOString();
      expect(isWithinUnsendWindow(recent)).toBe(true);
    });

    it('should return false for dates beyond window', () => {
      const old = new Date(Date.now() - UNSEND_WINDOW_MS - 1000).toISOString();
      expect(isWithinUnsendWindow(old)).toBe(false);
    });
  });

  describe('jsonToCsv', () => {
    it('should return empty template if no rows', () => {
      expect(jsonToCsv([])).toBe('id,createdAt,sessionId,target,message,status,error\r\n');
    });

    it('should convert objects to csv', () => {
      const rows = [
        { id: '1', name: 'test' },
        { id: '2', name: 'comma,value' }
      ];
      const csv = jsonToCsv(rows);
      expect(csv).toContain('id,name');
      expect(csv).toContain('1,test');
      expect(csv).toContain('2,"comma,value"');
    });
  });
});
