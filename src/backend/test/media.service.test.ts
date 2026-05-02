import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    mkdir: jest.fn<any>().mockResolvedValue(undefined),
    writeFile: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

// Mock global fetch for loadMediaFromUrl tests
const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

const {
  isHttpUrl, filenameFromUrl, saveUploadedFile,
  loadMediaFromUrl, loadMediaFromUpload, resolveMediaInput,
} = await import('../service/media.service.js');

describe('media.service — isHttpUrl', () => {
  it('returns true for http and https URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('https://example.com/image.png')).toBe(true);
  });
  it('returns false for non-http protocols', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('file:///tmp/file.png')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('media.service — filenameFromUrl', () => {
  it('extracts filename from URL path', () => {
    expect(filenameFromUrl('https://example.com/path/to/image.png')).toBe('image.png');
  });
  it('decodes URL-encoded characters', () => {
    expect(filenameFromUrl('https://example.com/image%20name.png')).toBe('image name.png');
  });
  it('returns "file" for URLs with no filename', () => {
    expect(filenameFromUrl('https://example.com/')).toBe('file');
    expect(filenameFromUrl('invalid url')).toBe('file');
  });
  it('sanitizes special characters from filename', () => {
    const result = filenameFromUrl('https://example.com/file<name>.png');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

describe('media.service — saveUploadedFile', () => {
  it('returns null for falsy file', async () => {
    expect(await saveUploadedFile(null, 'prefix')).toBe(null);
    expect(await saveUploadedFile(undefined, 'prefix')).toBe(null);
  });
  it('returns null if file lacks arrayBuffer method', async () => {
    expect(await saveUploadedFile({}, 'prefix')).toBe(null);
  });
  it('returns null for empty buffer', async () => {
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(0)), type: 'image/png', name: 'test.png' };
    expect(await saveUploadedFile(file, 'prefix')).toBe(null);
  });
  it('returns null for oversized file (>2.5MB)', async () => {
    const buf = new ArrayBuffer(2_600_000);
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(buf), type: 'image/png', name: 'big.png' };
    expect(await saveUploadedFile(file, 'prefix')).toBe(null);
  });
  it('saves valid PNG file and returns URL path', async () => {
    const buf = new ArrayBuffer(100);
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(buf), type: 'image/png', name: 'test.png' };
    const result = await saveUploadedFile(file, 'test');
    expect(result).toContain('/assets/uploads/test-');
    expect(result).toContain('.png');
  });
  it('infers extension from file name when content-type is unknown', async () => {
    const buf = new ArrayBuffer(100);
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(buf), type: '', name: 'audio.mp3' };
    const result = await saveUploadedFile(file, 'audio');
    expect(result).toContain('.mp3');
  });
});

describe('media.service — loadMediaFromUrl', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('throws for non-http URL', async () => {
    await expect(loadMediaFromUrl('ftp://bad.com', 1000)).rejects.toThrow('invalid_media_url');
  });

  it('throws when fetch response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    await expect(loadMediaFromUrl('https://example.com/img.png', 100000)).rejects.toThrow('media_fetch_failed:404');
  });

  it('throws when content-length exceeds maxBytes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => h === 'content-length' ? '999999' : 'image/png' },
      arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(10)),
      body: null,
    });
    await expect(loadMediaFromUrl('https://example.com/big.png', 100)).rejects.toThrow('media_too_large');
  });

  it('returns LoadedMedia on success', async () => {
    const buf = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
      arrayBuffer: jest.fn<any>().mockResolvedValue(buf.buffer),
      body: null,
    });
    const result = await loadMediaFromUrl('https://example.com/photo.jpg', 1_000_000);
    expect(result.mimetype).toBe('image/jpeg');
    expect(result.filename).toBe('photo.jpg');
    expect(result.isAudio).toBe(false);
    expect(result.source).toEqual({ kind: 'url', url: 'https://example.com/photo.jpg' });
  });

  it('marks isAudio true for audio content-type', async () => {
    const buf = Buffer.from('audio-data');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'audio/mpeg' : null },
      arrayBuffer: jest.fn<any>().mockResolvedValue(buf.buffer),
      body: null,
    });
    const result = await loadMediaFromUrl('https://example.com/song.mp3', 1_000_000);
    expect(result.isAudio).toBe(true);
  });
});

describe('media.service — loadMediaFromUpload', () => {
  it('throws if file is missing', async () => {
    await expect(loadMediaFromUpload(null, 1000)).rejects.toThrow('missing_media_file');
  });
  it('throws if file has no arrayBuffer method', async () => {
    await expect(loadMediaFromUpload({}, 1000)).rejects.toThrow('missing_media_file');
  });
  it('throws for empty buffer', async () => {
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(0)), type: 'image/png', size: 0 };
    await expect(loadMediaFromUpload(file, 1000)).rejects.toThrow('empty_media_file');
  });
  it('throws if declared size exceeds maxBytes', async () => {
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(10)), type: 'image/png', size: 9999, name: 'f.png' };
    await expect(loadMediaFromUpload(file, 100)).rejects.toThrow('media_too_large');
  });
  it('returns LoadedMedia for valid upload', async () => {
    const buf = Buffer.from('image-content');
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(buf.buffer), type: 'image/png', size: buf.length, name: 'photo.png' };
    const result = await loadMediaFromUpload(file, 1_000_000);
    expect(result.mimetype).toBe('image/png');
    expect(result.filename).toBe('photo.png');
    expect(result.isAudio).toBe(false);
    expect(result.source).toEqual({ kind: 'upload', name: 'photo.png' });
  });
});

describe('media.service — resolveMediaInput', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns null when no input is provided', async () => {
    expect(await resolveMediaInput({ maxBytes: 1000 })).toBe(null);
  });
  it('returns null for empty mediaUrl and no file', async () => {
    expect(await resolveMediaInput({ mediaUrl: '   ', maxBytes: 1000 })).toBe(null);
  });
  it('calls loadMediaFromUrl when mediaUrl is provided', async () => {
    const buf = Buffer.from('data');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'image/png' : null },
      arrayBuffer: jest.fn<any>().mockResolvedValue(buf.buffer),
      body: null,
    });
    const result = await resolveMediaInput({ mediaUrl: 'https://example.com/img.png', maxBytes: 1_000_000 });
    expect(result).not.toBeNull();
    expect(result?.source.kind).toBe('url');
  });
  it('calls loadMediaFromUpload when valid file is provided', async () => {
    const buf = Buffer.from('file-data');
    const file = { arrayBuffer: jest.fn<any>().mockResolvedValue(buf.buffer), type: 'image/jpeg', size: buf.length, name: 'upload.jpg' };
    const result = await resolveMediaInput({ mediaFile: file, maxBytes: 1_000_000 });
    expect(result).not.toBeNull();
    expect(result?.source.kind).toBe('upload');
  });
});
