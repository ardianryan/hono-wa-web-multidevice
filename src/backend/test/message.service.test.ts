import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSessionsMap = new Map<string, any>();
const mockClient = { getMessageById: jest.fn<any>() };

jest.unstable_mockModule('../session/session-manager.js', () => ({
  sessions: mockSessionsMap,
  getOrCreateSession: jest.fn<any>(() => ({ status: 'READY', client: mockClient })),
}));

const {
  toHistoryActionType, historyBasePath, historyPathWithSession,
  collectMessageIds, isWithinUnsendWindow, jsonToCsv,
  unsendByMessageIds, UNSEND_WINDOW_MS,
} = await import('../service/message.service.js');

describe('message.service — toHistoryActionType', () => {
  it('returns valid types unchanged', () => {
    expect(toHistoryActionType('broadcast')).toBe('broadcast');
    expect(toHistoryActionType('status')).toBe('status');
    expect(toHistoryActionType('message')).toBe('message');
  });
  it('falls back to "message" for invalid input', () => {
    expect(toHistoryActionType('invalid')).toBe('message');
    expect(toHistoryActionType('')).toBe('message');
    expect(toHistoryActionType('BROADCAST')).toBe('message');
  });
});

describe('message.service — historyBasePath', () => {
  it('returns correct path for each type', () => {
    expect(historyBasePath('broadcast')).toBe('/admin/broadcast');
    expect(historyBasePath('status')).toBe('/admin/status');
    expect(historyBasePath('message')).toBe('/admin/message');
  });
});

describe('message.service — historyPathWithSession', () => {
  it('returns base path when sessionId is absent or blank', () => {
    expect(historyPathWithSession('broadcast')).toBe('/admin/broadcast');
    expect(historyPathWithSession('message', '  ')).toBe('/admin/message');
  });
  it('appends encoded sessionId', () => {
    expect(historyPathWithSession('broadcast', '123')).toBe('/admin/broadcast?sessionId=123');
    expect(historyPathWithSession('message', 'a b')).toBe('/admin/message?sessionId=a%20b');
  });
});

describe('message.service — collectMessageIds', () => {
  it('collects direct sentMessageIds', () => {
    expect(collectMessageIds({ sentMessageIds: ['id1', 'id2'] })).toEqual(['id1', 'id2']);
  });
  it('collects nested messageIds from sentItems', () => {
    const payload = { sentItems: [{ messageIds: ['id1', 'id2'] }, { messageIds: ['id3'] }] };
    expect(collectMessageIds(payload)).toEqual(['id1', 'id2', 'id3']);
  });
  it('deduplicates and filters empty values', () => {
    const payload = { sentMessageIds: ['id1', '', 'id2'], sentItems: [{ messageIds: ['id2', 'id3'] }] };
    expect(collectMessageIds(payload)).toEqual(['id1', 'id2', 'id3']);
  });
  it('returns empty array for empty/null payload', () => {
    expect(collectMessageIds({})).toEqual([]);
    expect(collectMessageIds(null)).toEqual([]);
  });
});

describe('message.service — isWithinUnsendWindow', () => {
  it('returns false for null/invalid dates', () => {
    expect(isWithinUnsendWindow(null)).toBe(false);
    expect(isWithinUnsendWindow('invalid')).toBe(false);
    expect(isWithinUnsendWindow('')).toBe(false);
  });
  it('returns true for a recent timestamp', () => {
    expect(isWithinUnsendWindow(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });
  it('returns false for a timestamp beyond the window', () => {
    expect(isWithinUnsendWindow(new Date(Date.now() - UNSEND_WINDOW_MS - 5000).toISOString())).toBe(false);
  });
});

describe('message.service — jsonToCsv', () => {
  it('returns header template for empty array', () => {
    expect(jsonToCsv([])).toBe('id,createdAt,sessionId,target,message,status,error\r\n');
  });
  it('converts objects to CSV', () => {
    const csv = jsonToCsv([{ id: '1', name: 'test' }]);
    expect(csv).toContain('id,name');
    expect(csv).toContain('1,test');
  });
  it('wraps values with commas in double quotes', () => {
    expect(jsonToCsv([{ id: '1', v: 'a,b' }])).toContain('"a,b"');
  });
  it('escapes double-quotes inside values', () => {
    expect(jsonToCsv([{ id: '1', v: 'say "hi"' }])).toContain('"say ""hi"""');
  });
});

describe('message.service — unsendByMessageIds', () => {
  beforeEach(() => { jest.clearAllMocks(); mockSessionsMap.clear(); });

  it('throws if session is not READY', async () => {
    mockSessionsMap.set('s1', { status: 'initializing', client: mockClient });
    await expect(unsendByMessageIds('s1', ['id1'])).rejects.toThrow('not_ready:initializing');
  });

  it('returns count of revoked messages, skipping missing ones', async () => {
    const mockMsg = { delete: jest.fn<any>().mockResolvedValue(undefined) };
    mockClient.getMessageById.mockResolvedValueOnce(null).mockResolvedValueOnce(mockMsg);
    mockSessionsMap.set('s1', { status: 'ready', client: mockClient });
    expect(await unsendByMessageIds('s1', ['id1', 'id2'])).toBe(1);
    expect(mockMsg.delete).toHaveBeenCalledWith(true);
  });

  it('returns 0 when no messages found', async () => {
    mockClient.getMessageById.mockResolvedValue(null);
    mockSessionsMap.set('s1', { status: 'ready', client: mockClient });
    expect(await unsendByMessageIds('s1', ['id1'])).toBe(0);
  });
});
