import { describe, it, expect } from '@jest/globals';
import { getMessageText } from '../service/ai.service.js';

describe('ai.service - getMessageText', () => {
  it('should return content if it is a string', () => {
    const msg = { role: 'user', content: 'hello world' };
    expect(getMessageText(msg)).toBe('hello world');
  });

  it('should return combined text from content array', () => {
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

  it('should return combined text from parts array', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', content: 'part one' },
        { type: 'text', content: 'part two' },
      ],
    };
    expect(getMessageText(msg)).toBe('part one\npart two');
  });

  it('should return empty string if no text is found', () => {
    const msg = { role: 'user', content: null };
    expect(getMessageText(msg)).toBe('');
  });
});
