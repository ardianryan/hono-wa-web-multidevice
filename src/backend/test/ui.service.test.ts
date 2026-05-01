import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// For ESM mocking in Jest, we define mocks before importing the module
jest.unstable_mockModule('../utils/auth.js', () => ({
  getAppName: jest.fn(),
  getAppDescription: jest.fn(),
  getAppLogoUrl: jest.fn(),
}));

const { md5Hex, getGravatarUrl, getAvatarUrl, getUiSettings, withToast, DEFAULT_APP_LOGO_URL } = await import('../service/ui.service.js');
const authMock = await import('../utils/auth.js');

describe('ui.service', () => {
  describe('md5Hex', () => {
    it('should correctly hash a string', () => {
      expect(md5Hex('test')).toBe('098f6bcd4621d373cade4e832627b4f6');
    });

    it('should lowercase and trim string before hashing', () => {
      expect(md5Hex('  TeSt  ')).toBe('098f6bcd4621d373cade4e832627b4f6');
    });
  });

  describe('getGravatarUrl', () => {
    it('should generate valid gravatar url', () => {
      const url = getGravatarUrl('test@example.com', 128);
      expect(url).toContain('s=128');
      expect(url).toContain(md5Hex('test@example.com'));
    });
  });

  describe('getAvatarUrl', () => {
    it('should return profilePhotoUrl if available', () => {
      const user = { id: '1', username: 'test', profilePhotoUrl: 'http://photo.com' };
      expect(getAvatarUrl(user as any)).toBe('http://photo.com');
    });

    it('should fallback to gravatar based on email if profilePhotoUrl is not available', () => {
      const user = { id: '1', username: 'test', email: 'test@test.com' };
      const url = getAvatarUrl(user as any);
      expect(url).toContain('gravatar.com');
      expect(url).toContain(md5Hex('test@test.com'));
    });

    it('should fallback to gravatar based on username if email is missing', () => {
      const user = { id: '1', username: 'testuser' };
      const url = getAvatarUrl(user as any);
      expect(url).toContain('gravatar.com');
      expect(url).toContain(md5Hex('testuser'));
    });
  });

  describe('withToast', () => {
    it('should append toast parameters to URL without query params', () => {
      const url = '/home';
      const result = withToast(url, 'Hello', 'success');
      expect(result).toBe('/home?toast=Hello&toastType=success');
    });

    it('should append toast parameters to URL with existing query params', () => {
      const url = '/home?ref=123';
      const result = withToast(url, 'Hello', 'error');
      expect(result).toBe('/home?ref=123&toast=Hello&toastType=error');
    });
  });

  describe('getUiSettings', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return settings with custom logo', async () => {
      (authMock.getAppName as any).mockResolvedValue('MyApp');
      (authMock.getAppDescription as any).mockResolvedValue('MyDesc');
      (authMock.getAppLogoUrl as any).mockResolvedValue('/custom/logo.png');

      const settings = await getUiSettings();
      expect(settings).toEqual({
        appName: 'MyApp',
        appDescription: 'MyDesc',
        appLogoUrl: '/custom/logo.png',
        appLogoIsDefault: false,
      });
    });

    it('should return default logo if no custom logo is provided', async () => {
      (authMock.getAppName as any).mockResolvedValue('MyApp');
      (authMock.getAppDescription as any).mockResolvedValue('MyDesc');
      (authMock.getAppLogoUrl as any).mockResolvedValue('');

      const settings = await getUiSettings();
      expect(settings).toEqual({
        appName: 'MyApp',
        appDescription: 'MyDesc',
        appLogoUrl: DEFAULT_APP_LOGO_URL,
        appLogoIsDefault: true,
      });
    });
  });
});
