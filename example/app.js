'use strict';

const express = require('express');
const docify = require('../src/index');

const app = express();
app.use(express.json());

// ─── Docify: Just one line! ──────────────────────────────
app.use(docify({ docsPath: '/docs' }));
// ─────────────────────────────────────────────────────────

// ─── In-memory data ─────────────────────────────────────
let users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' },
];
let nextUserId = 4;

const products = [
  { id: 1, name: 'Wireless Keyboard', price: 49.99, category: 'electronics', inStock: true },
  { id: 2, name: 'USB-C Hub', price: 29.99, category: 'electronics', inStock: true },
  { id: 3, name: 'Standing Desk Mat', price: 39.99, category: 'office', inStock: false },
];

// ─── User Routes ────────────────────────────────────────

// List users
app.get('/api/users', (req, res) => {
  const { role } = req.query;
  let result = users;
  if (role) result = users.filter(u => u.role === role);
  res.json({ users: result, total: result.length });
});

// Get user by ID
app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Create user
app.post('/api/users', (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const user = { id: nextUserId++, name, email, role: role || 'user' };
  users.push(user);
  res.status(201).json(user);
});

// Update user
app.put('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, email, role } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (role) user.role = role;
  res.json(user);
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users.splice(idx, 1);
  res.json({ message: 'User deleted successfully' });
});

// ─── Auth Routes (tests sanitization) ──────────────────

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({
    message: 'Login successful',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.token',
    refreshToken: 'rt_abc123def456',
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ─── Product Routes ─────────────────────────────────────

app.get('/api/products', (req, res) => {
  const { category, inStock } = req.query;
  let result = products;
  if (category) result = result.filter(p => p.category === category);
  if (inStock !== undefined) result = result.filter(p => p.inStock === (inStock === 'true'));
  res.json({ products: result, total: result.length });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// ─── Health Check ───────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── Start Server ───────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║         🚀 Docify Example Server         ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  API:    http://localhost:${PORT}/api         ║`);
  console.log(`  ║  Docs:   http://localhost:${PORT}/docs        ║`);
  console.log('  ║                                          ║');
  console.log('  ║  Make some API calls, then visit /docs   ║');
  console.log('  ║  to see auto-generated documentation!    ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
