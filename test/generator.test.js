import { describe, it, expect, beforeEach } from 'vitest';
const { DocGenerator } = require('../src/docs/generator');
const { RouteRegistry } = require('../src/core/routeRegistry');

describe('DocGenerator', () => {
  let registry;
  let generator;

  beforeEach(() => {
    registry = new RouteRegistry();
    generator = new DocGenerator(registry);
  });

  it('should generate empty docs when no endpoints exist', () => {
    const docs = generator.generate();
    expect(docs.endpoints).toHaveLength(0);
    expect(docs.stats.totalEndpoints).toBe(0);
    expect(docs.stats.totalRequests).toBe(0);
    expect(docs.name).toBe('API Documentation');
    expect(docs.generatedAt).toBeDefined();
  });

  it('should include all registered endpoints', () => {
    registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
    registry.register({ method: 'POST', path: '/api/users', statusCode: 201 });
    registry.register({ method: 'GET', path: '/api/products', statusCode: 200 });

    const docs = generator.generate();
    expect(docs.endpoints).toHaveLength(3);
    expect(docs.stats.totalEndpoints).toBe(3);
  });

  it('should sort endpoints by path then method', () => {
    registry.register({ method: 'POST', path: '/api/users', statusCode: 201 });
    registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
    registry.register({ method: 'DELETE', path: '/api/users/:id', statusCode: 200 });
    registry.register({ method: 'GET', path: '/api/products', statusCode: 200 });

    const docs = generator.generate();
    expect(docs.endpoints[0].path).toBe('/api/products');
    expect(docs.endpoints[1].method).toBe('GET');
    expect(docs.endpoints[1].path).toBe('/api/users');
    expect(docs.endpoints[2].method).toBe('POST');
    expect(docs.endpoints[2].path).toBe('/api/users');
  });

  it('should group endpoints by resource', () => {
    registry.register({ method: 'GET', path: '/api/users', statusCode: 200 });
    registry.register({ method: 'POST', path: '/api/users', statusCode: 201 });
    registry.register({ method: 'GET', path: '/api/products', statusCode: 200 });

    const docs = generator.generate();
    expect(docs.groups).toBeDefined();
    expect(docs.groups.users).toHaveLength(2);
    expect(docs.groups.products).toHaveLength(1);
  });

  it('should skip api/v1 prefixes when grouping', () => {
    registry.register({ method: 'GET', path: '/api/v1/orders', statusCode: 200 });
    const docs = generator.generate();
    expect(docs.groups.orders).toHaveLength(1);
  });
});
