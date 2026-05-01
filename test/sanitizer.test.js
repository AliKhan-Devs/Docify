import { describe, it, expect } from 'vitest';
const { Sanitizer, REDACTED } = require('../src/core/sanitizer');

describe('Sanitizer', () => {
  const sanitizer = new Sanitizer();

  describe('basic field masking', () => {
    it('should mask password fields', () => {
      const result = sanitizer.sanitize({ username: 'john', password: 'secret123' });
      expect(result.username).toBe('john');
      expect(result.password).toBe(REDACTED);
    });

    it('should mask token fields', () => {
      const result = sanitizer.sanitize({ token: 'abc123', data: 'visible' });
      expect(result.token).toBe(REDACTED);
      expect(result.data).toBe('visible');
    });

    it('should mask authorization fields', () => {
      const result = sanitizer.sanitize({ authorization: 'Bearer xyz', id: 1 });
      expect(result.authorization).toBe(REDACTED);
      expect(result.id).toBe(1);
    });

    it('should mask api_key fields', () => {
      const result = sanitizer.sanitize({ api_key: 'key123', name: 'test' });
      expect(result.api_key).toBe(REDACTED);
    });

    it('should mask secret fields', () => {
      const result = sanitizer.sanitize({ secret: 'shhh', public: 'ok' });
      expect(result.secret).toBe(REDACTED);
    });
  });

  describe('nested objects', () => {
    it('should mask nested sensitive fields', () => {
      const result = sanitizer.sanitize({
        user: {
          name: 'Alice',
          credentials: {
            password: 'hidden',
            token: 'also-hidden',
          },
        },
      });
      expect(result.user.name).toBe('Alice');
      expect(result.user.credentials.password).toBe(REDACTED);
      expect(result.user.credentials.token).toBe(REDACTED);
    });

    it('should handle arrays of objects', () => {
      const result = sanitizer.sanitize([
        { name: 'Alice', password: '123' },
        { name: 'Bob', password: '456' },
      ]);
      expect(result[0].name).toBe('Alice');
      expect(result[0].password).toBe(REDACTED);
      expect(result[1].password).toBe(REDACTED);
    });
  });

  describe('edge cases', () => {
    it('should handle null input', () => {
      expect(sanitizer.sanitize(null)).toBeNull();
    });

    it('should handle undefined input', () => {
      expect(sanitizer.sanitize(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(sanitizer.sanitize('hello')).toBe('hello');
      expect(sanitizer.sanitize(42)).toBe(42);
      expect(sanitizer.sanitize(true)).toBe(true);
    });

    it('should not mutate the original object', () => {
      const original = { password: 'secret', name: 'test' };
      sanitizer.sanitize(original);
      expect(original.password).toBe('secret');
    });
  });

  describe('header sanitization', () => {
    it('should mask authorization header', () => {
      const result = sanitizer.sanitizeHeaders({
        'content-type': 'application/json',
        authorization: 'Bearer abc123',
        'x-api-key': 'key-456',
      });
      expect(result['content-type']).toBe('application/json');
      expect(result.authorization).toBe(REDACTED);
      expect(result['x-api-key']).toBe(REDACTED);
    });
  });

  describe('custom fields', () => {
    it('should mask additional custom fields', () => {
      const custom = new Sanitizer({ additionalFields: ['my_secret_field'] });
      const result = custom.sanitize({ my_secret_field: 'hidden', visible: 'ok' });
      expect(result.my_secret_field).toBe(REDACTED);
      expect(result.visible).toBe('ok');
    });
  });

  describe('disabled sanitizer', () => {
    it('should return data as-is when disabled', () => {
      const disabled = new Sanitizer({ enabled: false });
      const result = disabled.sanitize({ password: 'visible' });
      expect(result.password).toBe('visible');
    });
  });
});
