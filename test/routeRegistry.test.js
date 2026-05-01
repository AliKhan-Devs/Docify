import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RouteRegistry } = require('../src/core/routeRegistry');

describe('RouteRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new RouteRegistry({ maxExamples: 3 });
  });

  describe('register', () => {
    it('should register a new endpoint', () => {
      registry.register({
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        responseBody: { users: [] },
      });

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].method).toBe('GET');
      expect(all[0].path).toBe('/api/users');
      expect(all[0].hitCount).toBe(1);
    });

    it('should merge duplicate endpoints', () => {
      registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
      registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
      registry.register({ method: 'GET', path: '/api/users', statusCode: 404 });

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].hitCount).toBe(3);
      expect(all[0].statusCodes).toContain(200);
      expect(all[0].statusCodes).toContain(404);
    });

    it('should cap examples at maxExamples', () => {
      for (let i = 0; i < 5; i++) {
        registry.register({
          method: 'POST',
          path: '/api/users',
          statusCode: 201,
          requestBody: { name: `user-${i}` },
          responseBody: { id: i },
        });
      }

      const all = registry.getAll();
      expect(all[0].requestExamples.length).toBe(3);
      expect(all[0].responseExamples.length).toBe(3);
      // Should keep the latest examples
      expect(all[0].requestExamples[2].body.name).toBe('user-4');
    });
  });

  describe('normalizePath', () => {
    it('should replace numeric IDs with :id', () => {
      expect(registry.normalizePath('/users/123')).toBe('/users/:id');
    });

    it('should replace UUIDs with :id', () => {
      expect(registry.normalizePath('/users/550e8400-e29b-41d4-a716-446655440000'))
        .toBe('/users/:id');
    });

    it('should replace MongoDB ObjectIds with :id', () => {
      expect(registry.normalizePath('/users/507f1f77bcf86cd799439011'))
        .toBe('/users/:id');
    });

    it('should not replace non-dynamic segments', () => {
      expect(registry.normalizePath('/api/users')).toBe('/api/users');
    });

    it('should handle multiple dynamic segments', () => {
      expect(registry.normalizePath('/users/123/posts/456'))
        .toBe('/users/:id/posts/:id');
    });

    it('should remove query strings', () => {
      expect(registry.normalizePath('/users?page=1')).toBe('/users');
    });
  });

  describe('getByRoute', () => {
    it('should retrieve a specific endpoint', () => {
      registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
      const result = registry.getByRoute('GET', '/api/users');
      expect(result).not.toBeNull();
      expect(result.method).toBe('GET');
    });

    it('should return null for unknown routes', () => {
      const result = registry.getByRoute('GET', '/unknown');
      expect(result).toBeNull();
    });
  });

  describe('events', () => {
    it('should emit update event on register', () => {
      let emitted = false;
      registry.on('update', () => { emitted = true; });
      registry.register({ method: 'GET', path: '/test', statusCode: 200 });
      expect(emitted).toBe(true);
    });

    it('should emit clear event on clear', () => {
      let emitted = false;
      registry.on('clear', () => { emitted = true; });
      registry.clear();
      expect(emitted).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      registry.register({ method: 'GET', path: '/a', statusCode: 200 });
      registry.register({ method: 'POST', path: '/b', statusCode: 201 });
      registry.register({ method: 'GET', path: '/a', statusCode: 200 });

      const stats = registry.getStats();
      expect(stats.totalEndpoints).toBe(2);
      expect(stats.totalRequests).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all endpoints', () => {
      registry.register({ method: 'GET', path: '/a', statusCode: 200 });
      registry.register({ method: 'POST', path: '/b', statusCode: 201 });
      registry.clear();
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete a single endpoint', () => {
      registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
      registry.register({ method: 'POST', path: '/api/users', statusCode: 201 });

      expect(registry.delete('GET', '/api/users')).toBe(true);
      expect(registry.getByRoute('GET', '/api/users')).toBeNull();
      expect(registry.getByRoute('POST', '/api/users')).not.toBeNull();
    });

    it('should emit delete event when an endpoint is removed', () => {
      let emitted = false;
      registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
      registry.on('delete', () => { emitted = true; });

      registry.delete('GET', '/api/users');

      expect(emitted).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should load endpoints from the configured storage file', () => {
      const storagePath = path.join(os.tmpdir(), `docify-${Date.now()}-${Math.random()}.json`);
      const first = new RouteRegistry({ maxExamples: 3, persist: true, storagePath });

      first.register({
        method: 'POST',
        path: '/api/users',
        statusCode: 201,
        requestBody: { name: 'Alice' },
        responseBody: { id: 1 },
      });

      const second = new RouteRegistry({ maxExamples: 3, persist: true, storagePath });
      const ep = second.getByRoute('POST', '/api/users');

      expect(ep).not.toBeNull();
      expect(ep.hitCount).toBe(1);
      expect(ep.statusCodes).toContain(201);

      fs.rmSync(storagePath, { force: true });
    });
  });

  describe('query params tracking', () => {
    it('should track observed query parameter keys', () => {
      registry.register({
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        requestQuery: { page: '1', limit: '10' },
      });
      registry.register({
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        requestQuery: { page: '2', sort: 'name' },
      });

      const ep = registry.getByRoute('GET', '/api/users');
      expect(ep.queryParams).toContain('page');
      expect(ep.queryParams).toContain('limit');
      expect(ep.queryParams).toContain('sort');
    });
  });
});
