import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const express = require('express');
const request = require('supertest');
const docify = require('../src/index');

describe('Capture Middleware (integration)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(docify({ docsPath: '/docs', sanitize: true }));

    app.get('/api/users', (req, res) => {
      res.json({ users: [{ id: 1, name: 'Alice' }] });
    });

    app.post('/api/users', (req, res) => {
      res.status(201).json({ id: 2, ...req.body });
    });

    app.post('/api/auth/login', (req, res) => {
      res.json({ token: 'secret-jwt-token', user: { id: 1 } });
    });

    app.get('/api/binary', (req, res) => {
      res.setHeader('Content-Type', 'image/png');
      res.send(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
  });

  it('should capture GET requests', async () => {
    await request(app).get('/api/users').expect(200);

    const res = await request(app).get('/docs/api.json').expect(200);
    const docs = res.body;
    const ep = docs.endpoints.find(e => e.method === 'GET' && e.path === '/api/users');
    expect(ep).toBeDefined();
    expect(ep.statusCodes).toContain(200);
    expect(ep.hitCount).toBeGreaterThanOrEqual(1);
  });

  it('should capture POST requests with body', async () => {
    await request(app)
      .post('/api/users')
      .send({ name: 'Bob', email: 'bob@test.com' })
      .expect(201);

    const res = await request(app).get('/docs/api.json').expect(200);
    const ep = res.body.endpoints.find(e => e.method === 'POST' && e.path === '/api/users');
    expect(ep).toBeDefined();
    expect(ep.statusCodes).toContain(201);
    expect(ep.requestExamples.length).toBeGreaterThanOrEqual(1);
  });

  it('should sanitize sensitive fields in responses', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'secret' })
      .expect(200);

    const res = await request(app).get('/docs/api.json').expect(200);
    const ep = res.body.endpoints.find(e => e.path === '/api/auth/login');
    expect(ep).toBeDefined();

    // Check request body is sanitized
    const reqExample = ep.requestExamples.find(e => e.body);
    if (reqExample) {
      expect(reqExample.body.password).toBe('[REDACTED]');
    }

    // Check response body is sanitized
    const resExample = ep.responseExamples.find(e => e.body);
    if (resExample) {
      expect(resExample.body.token).toBe('[REDACTED]');
    }
  });

  it('should not capture docs routes', async () => {
    await request(app).get('/docs/api.json').expect(200);
    const res = await request(app).get('/docs/api.json').expect(200);
    const docsEndpoint = res.body.endpoints.find(e => e.path.startsWith('/docs'));
    expect(docsEndpoint).toBeUndefined();
  });

  it('should serve the docs UI HTML', async () => {
    const res = await request(app).get('/docs').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Docify');
  });

  it('should return correct stats', async () => {
    const res = await request(app).get('/docs/api.json').expect(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalEndpoints).toBeGreaterThanOrEqual(1);
  });
});

describe('Docify disabled mode', () => {
  it('should be a no-op when disabled', async () => {
    const app = express();
    app.use(docify({ enabled: false }));
    app.get('/test', (req, res) => res.json({ ok: true }));

    await request(app).get('/test').expect(200);
    // Docs routes should not be mounted
    await request(app).get('/docs').expect(404);
  });
});
