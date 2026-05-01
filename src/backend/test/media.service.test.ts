import { describe, it, expect, jest } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    mkdir: jest.fn<any>().mockResolvedValue(undefined),
    writeFile: jest.fn<any>().mockResolvedValue(undefined),
  }
}));

const { 
  isHttpUrl, 
  filenameFromUrl, 
  saveUploadedFile,
  resolveMediaInput 
} = await import('../service/media.service.js');

describe('media.service', () => {
  describe('isHttpUrl', () => {
    it('should return true for valid http/https urls', () => {
      expect(isHttpUrl('http://example.com')).toBe(true);
      expect(isHttpUrl('https://example.com/image.png')).toBe(true);
    });

    it('should return false for invalid urls', () => {
      expect(isHttpUrl('ftp://example.com')).toBe(false);
      expect(isHttpUrl('not a url')).toBe(false);
      expect(isHttpUrl('file:///tmp/file.png')).toBe(false);
    });
  });

  describe('filenameFromUrl', () => {
    it('should extract filename from url', () => {
      expect(filenameFromUrl('https://example.com/path/to/image.png')).toBe('image.png');
    });

    it('should sanitize filename', () => {
      expect(filenameFromUrl('https://example.com/image%20name.png')).toBe('image name.png');
    });

    it('should return default if no path', () => {
      expect(filenameFromUrl('https://example.com/')).toBe('file');
      expect(filenameFromUrl('invalid url')).toBe('file');
    });
  });

  describe('saveUploadedFile', () => {
    it('should return null if file is invalid', async () => {
      expect(await saveUploadedFile(null, 'prefix')).toBe(null);
      expect(await saveUploadedFile({}, 'prefix')).toBe(null); // missing arrayBuffer
    });

    it('should save file and return url', async () => {
      const mockFile = {
        arrayBuffer: jest.fn<any>().mockResolvedValue(new ArrayBuffer(10)),
        type: 'image/png',
        name: 'test.png'
      };
      const result = await saveUploadedFile(mockFile, 'test');
      expect(result).toContain('/assets/uploads/test-');
      expect(result).toContain('.png');
    });
  });

  describe('resolveMediaInput', () => {
    it('should return null if no input is provided', async () => {
      const result = await resolveMediaInput({ maxBytes: 1000 });
      expect(result).toBe(null);
    });
  });
});
