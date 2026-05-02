import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock external AI dependencies ───────────────────────────────────────────
jest.unstable_mockModule('@tanstack/ai', () => ({
  chat: jest.fn(),
  generateImage: jest.fn(),
  toServerSentEventsResponse: jest.fn(),
}));
jest.unstable_mockModule('@tanstack/ai-gemini', () => ({
  createGeminiChat: jest.fn(() => ({ type: 'gemini-adapter' })),
  geminiImage: jest.fn(() => ({ type: 'gemini-image-adapter' })),
}));
jest.unstable_mockModule('@tanstack/ai-openai', () => ({
  createOpenaiChat: jest.fn(() => ({ type: 'openai-adapter' })),
  openaiImage: jest.fn(() => ({ type: 'openai-image-adapter' })),
}));
jest.unstable_mockModule('@tanstack/ai-anthropic', () => ({
  createAnthropicChat: jest.fn(() => ({ type: 'anthropic-adapter' })),
}));
jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockInsert = jest.fn<any>();
const mockDelete = jest.fn<any>();
const mockSelect = jest.fn<any>();
const mockWhere = jest.fn<any>();
const mockOrderBy = jest.fn<any>();
const mockLimit = jest.fn<any>();
const mockValues = jest.fn<any>();

const mockDb = {
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
};

jest.unstable_mockModule('../config/db.js', () => ({ db: mockDb }));
jest.unstable_mockModule('../config/schema.js', () => ({
  aiChats: { userId: 'userId', id: 'id', createdAt: 'createdAt' },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
const {
  getMessageText,
  saveAiChatMessage,
  getAiChatHistory,
  deleteAllAiChatHistory,
} = await import('../service/ai.service.js');

const { createGeminiChat } = await import('@tanstack/ai-gemini');
const { createOpenaiChat, openaiImage } = await import('@tanstack/ai-openai');
const { createAnthropicChat } = await import('@tanstack/ai-anthropic');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ai.service — getMessageText', () => {
  it('returns content if string', () => {
    expect(getMessageText({ role: 'user', content: 'hello world' })).toBe('hello world');
  });

  it('returns combined text from content array (text parts only)', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', content: 'hello' },
        { type: 'image', url: '...' },
        { type: 'text', content: 'world' },
      ],
    };
    expect(getMessageText(msg)).toBe('hello\nworld');
  });

  it('returns combined text from parts array', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', content: 'part one' },
        { type: 'text', content: 'part two' },
      ],
    };
    expect(getMessageText(msg)).toBe('part one\npart two');
  });

  it('returns empty string for null/undefined content', () => {
    expect(getMessageText({ role: 'user', content: null })).toBe('');
    expect(getMessageText({ role: 'user' })).toBe('');
  });

  it('returns empty string if content array has no text parts', () => {
    const msg = { role: 'user', content: [{ type: 'image', url: 'img.png' }] };
    expect(getMessageText(msg)).toBe('');
  });

  it('filters out falsy values from parts array', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', content: '' },
        { type: 'text', content: 'valid' },
      ],
    };
    expect(getMessageText(msg)).toBe('valid');
  });
});

describe('ai.service — saveAiChatMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues.mockResolvedValue(undefined) });
  });

  it('skips insert if both content and reasoning are empty/falsy', async () => {
    await saveAiChatMessage({
      userId: 'u1',
      conversationId: 'c1',
      role: 'assistant',
      content: '',
      reasoning: undefined,
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts if content is provided', async () => {
    const insertValues = jest.fn<any>().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    await saveAiChatMessage({
      userId: 'u1',
      conversationId: 'c1',
      role: 'assistant',
      content: 'Hello there',
      model: 'gemma-4-31b-it',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.anything());
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-uuid-1234',
        userId: 'u1',
        conversationId: 'c1',
        role: 'assistant',
        content: 'Hello there',
        reasoning: null,
        model: 'gemma-4-31b-it',
      })
    );
  });

  it('inserts if only reasoning is provided', async () => {
    const insertValues = jest.fn<any>().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    await saveAiChatMessage({
      userId: 'u1',
      conversationId: 'c1',
      role: 'assistant',
      content: '',
      reasoning: 'thinking...',
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: 'thinking...' })
    );
  });

  it('uses DEFAULT_MODEL if model is not provided', async () => {
    const insertValues = jest.fn<any>().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: insertValues });

    await saveAiChatMessage({
      userId: 'u1',
      conversationId: 'c1',
      role: 'assistant',
      content: 'hi',
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemma-4-31b-it' })
    );
  });
});

describe('ai.service — getAiChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries DB and returns results with default limit 50', async () => {
    const expectedRows = [{ id: '1', content: 'hi' }];
    mockLimit.mockResolvedValue(expectedRows);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: jest.fn().mockReturnValue({ where: mockWhere }) });

    const result = await getAiChatHistory('user-1');
    expect(result).toEqual(expectedRows);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('uses custom limit when provided', async () => {
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: jest.fn().mockReturnValue({ where: mockWhere }) });

    await getAiChatHistory('user-1', 10);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});

describe('ai.service — deleteAllAiChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls db.delete with the correct userId', async () => {
    mockWhere.mockResolvedValue({ count: 5 });
    mockDelete.mockReturnValue({ where: mockWhere });

    await deleteAllAiChatHistory('user-abc');

    expect(mockDelete).toHaveBeenCalledWith(expect.anything());
    expect(mockWhere).toHaveBeenCalled();
  });
});
