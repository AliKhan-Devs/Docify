'use strict';

/**
 * Docify UI Server
 * 
 * Serves the documentation frontend (server-rendered HTML),
 * JSON API catalog, and SSE live update stream.
 */

const logger = require('../core/logger');
const http = require('http');
const https = require('https');

/**
 * Mount Docify doc routes onto an Express app.
 * 
 * @param {import('express').Application} app
 * @param {Object} options
 * @param {string} options.docsPath
 * @param {import('../docs/generator').DocGenerator} options.generator
 * @param {import('../core/routeRegistry').RouteRegistry} options.registry
 */
function mountDocsRoutes(app, options) {
  const { docsPath, generator, registry } = options;

  // --- JSON API ---
  app.get(`${docsPath}/api.json`, (req, res) => {
    res.json(generator.generate());
  });

  // --- SSE Live Stream ---
  app.get(`${docsPath}/stream`, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write('data: {"type":"connected"}\n\n');

    const onUpdate = (data) => {
      res.write(`data: ${JSON.stringify({ type: 'update', ...data })}\n\n`);
    };

    const onClear = () => {
      res.write(`data: ${JSON.stringify({ type: 'clear' })}\n\n`);
    };

    const onDelete = (data) => {
      res.write(`data: ${JSON.stringify({ type: 'delete', ...data })}\n\n`);
    };

    registry.on('update', onUpdate);
    registry.on('clear', onClear);
    registry.on('delete', onDelete);

    req.on('close', () => {
      registry.off('update', onUpdate);
      registry.off('clear', onClear);
      registry.off('delete', onDelete);
    });
  });

  // --- Clear endpoint ---
  app.delete(`${docsPath}/api.json`, (req, res) => {
    registry.clear();
    res.json({ success: true });
  });

  // --- Delete a single endpoint ---
  app.delete(`${docsPath}/endpoint`, async (req, res) => {
    const body = await readJsonBody(req);
    const method = body && body.method;
    const path = body && body.path;

    if (!method || !path) {
      return res.status(400).json({ error: 'method and path are required' });
    }

    const removed = registry.delete(method, path);
    if (!removed) {
      return res.status(404).json({ error: 'endpoint not found' });
    }

    res.json({ success: true });
  });

  // --- Try an endpoint from the docs UI ---
  app.post(`${docsPath}/try`, async (req, res) => {
    try {
      const body = await readJsonBody(req);
      const result = await runRequestFromDocs(req, body || {});
      res.status(result.statusCode).json(result);
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message || 'Request failed' });
    }
  });

  // --- Main Docs UI ---
  app.get(docsPath, (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(buildHTML(docsPath));
  });

  logger.info(`Docs UI mounted at ${docsPath}`);
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function runRequestFromDocs(req, payload) {
  const method = String(payload.method || 'GET').toUpperCase();
  const targetPath = String(payload.path || '').trim();
  const headers = payload.headers && typeof payload.headers === 'object' ? payload.headers : {};
  const body = payload.body;

  if (!targetPath || !targetPath.startsWith('/')) {
    const err = new Error('path must start with /');
    err.statusCode = 400;
    throw err;
  }

  const protocol = req.protocol === 'https' ? 'https:' : 'http:';
  const baseUrl = `${protocol}//${req.get('host')}`;
  const url = new URL(targetPath, baseUrl);
  const bodyAllowed = !['GET', 'HEAD'].includes(method);
  const requestBody = bodyAllowed && body !== undefined && body !== null && body !== ''
    ? (typeof body === 'string' ? body : JSON.stringify(body))
    : null;

  const requestHeaders = { ...headers };
  delete requestHeaders.host;
  delete requestHeaders.connection;
  delete requestHeaders['content-length'];

  if (requestBody && !hasHeader(requestHeaders, 'content-type')) {
    requestHeaders['content-type'] = 'application/json';
  }
  if (requestBody) {
    requestHeaders['content-length'] = Buffer.byteLength(requestBody);
  }

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const outbound = transport.request(url, {
      method,
      headers: requestHeaders,
    }, upstream => {
      const chunks = [];
      upstream.on('data', chunk => chunks.push(chunk));
      upstream.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const contentType = upstream.headers['content-type'] || '';
        resolve({
          statusCode: upstream.statusCode,
          statusMessage: upstream.statusMessage,
          headers: upstream.headers,
          body: parseResponseBody(rawBody, contentType),
          durationMs: Date.now() - startedAt,
        });
      });
    });

    outbound.on('error', reject);
    outbound.setTimeout(30000, () => {
      outbound.destroy(new Error('Request timed out after 30s'));
    });

    if (requestBody) outbound.write(requestBody);
    outbound.end();
  });
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === lower);
}

function parseResponseBody(rawBody, contentType) {
  if (!rawBody) return null;
  if (String(contentType).toLowerCase().includes('json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }
  return rawBody;
}

function buildHTML(docsPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Docify — API Documentation</title>
<meta name="description" content="Auto-generated API documentation powered by Docify">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${getCSS()}
</style>
</head>
<body>
<div id="app">
  <header class="topbar">
    <div class="topbar-brand">
      <div class="logo-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="7" fill="url(#lg)"/><path d="M8 9h5a5 5 0 010 10H8V9z" fill="#fff" fill-opacity=".9"/><circle cx="19" cy="14" r="3" fill="#fff" fill-opacity=".6"/><defs><linearGradient id="lg" x1="0" y1="0" x2="28" y2="28"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs></svg>
      </div>
      <h1 class="logo-text">Docify</h1>
      <span class="badge badge-live" id="live-badge">● LIVE</span>
    </div>
    <div class="topbar-stats">
      <div class="stat"><span class="stat-value" id="stat-endpoints">0</span><span class="stat-label">Endpoints</span></div>
      <div class="stat"><span class="stat-value" id="stat-requests">0</span><span class="stat-label">Requests</span></div>
    </div>
  </header>

  <div class="main-layout">
    <aside class="sidebar" id="sidebar">
      <div class="search-box">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input type="text" id="search-input" placeholder="Search endpoints..." autocomplete="off">
      </div>
      <nav class="endpoint-list" id="endpoint-list">
        <div class="empty-state" id="empty-state">
          <div class="empty-icon">📡</div>
          <p>No endpoints captured yet.</p>
          <p class="empty-hint">Make API requests to your server and they will appear here automatically.</p>
        </div>
      </nav>
    </aside>

    <main class="content" id="content">
      <div class="welcome" id="welcome">
        <div class="welcome-icon">
          <svg width="64" height="64" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="7" fill="url(#lg2)"/><path d="M8 9h5a5 5 0 010 10H8V9z" fill="#fff" fill-opacity=".9"/><circle cx="19" cy="14" r="3" fill="#fff" fill-opacity=".6"/><defs><linearGradient id="lg2" x1="0" y1="0" x2="28" y2="28"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs></svg>
        </div>
        <h2>Welcome to Docify</h2>
        <p>Select an endpoint from the sidebar to view its documentation, or make requests to your API to start generating docs automatically.</p>
      </div>

      <div class="endpoint-detail" id="endpoint-detail" style="display:none">
        <div class="detail-header">
          <span class="method-badge" id="detail-method"></span>
          <span class="detail-path" id="detail-path"></span>
          <button class="icon-btn danger" id="delete-endpoint-btn" type="button" title="Delete endpoint">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M6 4V2.8C6 2.36 6.36 2 6.8 2h2.4c.44 0 .8.36.8.8V4m2.5 0-.5 9.2c-.02.45-.38.8-.83.8H4.83c-.45 0-.81-.35-.83-.8L3.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M7 7v4M9 7v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="detail-meta">
          <span class="meta-item" id="detail-hits"></span>
          <span class="meta-item" id="detail-last-used"></span>
        </div>
        <div class="detail-status-codes" id="detail-status-codes"></div>

        <div class="section">
          <h3 class="section-title">Request Examples</h3>
          <div class="tabs" id="request-tabs"></div>
          <div class="code-block-wrapper" id="request-examples">
            <p class="no-data">No request body captured</p>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Response Examples</h3>
          <div class="tabs" id="response-tabs"></div>
          <div class="code-block-wrapper" id="response-examples">
            <p class="no-data">No response body captured</p>
          </div>
        </div>

        <div class="section" id="query-params-section" style="display:none">
          <h3 class="section-title">Query Parameters</h3>
          <div id="query-params"></div>
        </div>

        <div class="section">
          <h3 class="section-title">Try Request</h3>
          <div class="try-panel">
            <div class="try-row">
              <select id="try-method" class="try-method">
                <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
              </select>
              <input id="try-path" class="try-path" type="text" spellcheck="false">
              <button id="try-run-btn" class="run-btn" type="button">Run</button>
            </div>
            <textarea id="try-body" class="try-body" spellcheck="false" placeholder="JSON request body"></textarea>
            <div class="try-result" id="try-result" style="display:none"></div>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>

<script>
${getJS(docsPath)}
</script>
</body>
</html>`;
}

function getCSS() {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg-primary:#0a0b0f;--bg-secondary:#12131a;--bg-tertiary:#1a1b26;--bg-hover:#1f2133;
  --text-primary:#e2e4f0;--text-secondary:#8b8fa8;--text-muted:#5a5e78;
  --accent:#818cf8;--accent-hover:#a5b4fc;
  --border:#1e2035;--border-hover:#2d2f4a;
  --get:#34d399;--post:#60a5fa;--put:#fbbf24;--patch:#c084fc;--delete:#f87171;
  --get-bg:rgba(52,211,153,.1);--post-bg:rgba(96,165,250,.1);--put-bg:rgba(251,191,36,.1);
  --patch-bg:rgba(192,132,252,.1);--delete-bg:rgba(248,113,113,.1);
  --radius:10px;--radius-sm:6px;--radius-xs:4px;
  --shadow:0 4px 24px rgba(0,0,0,.4);
  --font-sans:'Inter',system-ui,-apple-system,sans-serif;
  --font-mono:'JetBrains Mono','Fira Code',monospace;
}
html{font-size:14px}
body{font-family:var(--font-sans);background:var(--bg-primary);color:var(--text-primary);min-height:100vh;overflow:hidden}
#app{display:flex;flex-direction:column;height:100vh}

/* Topbar */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;background:var(--bg-secondary);border-bottom:1px solid var(--border);flex-shrink:0;backdrop-filter:blur(12px);z-index:10}
.topbar-brand{display:flex;align-items:center;gap:10px}
.logo-icon{display:flex}
.logo-text{font-size:1.2rem;font-weight:700;background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{font-size:.65rem;font-weight:600;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px}
.badge-live{background:rgba(52,211,153,.15);color:#34d399;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.topbar-stats{display:flex;gap:24px}
.stat{display:flex;flex-direction:column;align-items:flex-end}
.stat-value{font-size:1.1rem;font-weight:700;color:var(--accent)}
.stat-label{font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px}

/* Layout */
.main-layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:320px;min-width:320px;background:var(--bg-secondary);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.content{flex:1;overflow-y:auto;padding:32px;background:var(--bg-primary)}

/* Search */
.search-box{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.search-icon{color:var(--text-muted);flex-shrink:0}
.search-box input{background:none;border:none;outline:none;color:var(--text-primary);font-family:var(--font-sans);font-size:.85rem;width:100%}
.search-box input::placeholder{color:var(--text-muted)}

/* Endpoint List */
.endpoint-list{flex:1;overflow-y:auto;padding:8px}
.endpoint-list::-webkit-scrollbar{width:4px}
.endpoint-list::-webkit-scrollbar-track{background:transparent}
.endpoint-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.group-label{font-size:.65rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;padding:16px 12px 6px;user-select:none}
.endpoint-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;transition:all .15s ease;margin-bottom:2px}
.endpoint-item:hover{background:var(--bg-hover)}
.endpoint-item.active{background:var(--bg-tertiary);border:1px solid var(--border-hover)}
.endpoint-item .method-badge{font-size:.6rem;font-weight:700;padding:3px 6px;border-radius:var(--radius-xs);min-width:48px;text-align:center;text-transform:uppercase;letter-spacing:.3px;flex-shrink:0}
.endpoint-item .ep-path{font-size:.8rem;font-family:var(--font-mono);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.endpoint-item .ep-hits{font-size:.65rem;color:var(--text-muted);margin-left:auto;flex-shrink:0}

.method-badge.get{background:var(--get-bg);color:var(--get)}
.method-badge.post{background:var(--post-bg);color:var(--post)}
.method-badge.put{background:var(--put-bg);color:var(--put)}
.method-badge.patch{background:var(--patch-bg);color:var(--patch)}
.method-badge.delete{background:var(--delete-bg);color:var(--delete)}

/* Empty State */
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;gap:8px}
.empty-icon{font-size:2.5rem;margin-bottom:8px}
.empty-state p{color:var(--text-secondary);font-size:.85rem}
.empty-hint{color:var(--text-muted)!important;font-size:.75rem!important}

/* Welcome */
.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:16px;opacity:.8}
.welcome-icon svg{width:64px;height:64px}
.welcome h2{font-size:1.5rem;font-weight:600}
.welcome p{color:var(--text-secondary);max-width:400px;line-height:1.6}

/* Detail View */
.detail-header{display:flex;align-items:center;gap:14px;margin-bottom:16px}
.detail-header .method-badge{font-size:.85rem;font-weight:700;padding:6px 14px;border-radius:var(--radius-sm)}
.detail-path{font-size:1.3rem;font-weight:600;font-family:var(--font-mono);min-width:0;overflow-wrap:anywhere}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-secondary);cursor:pointer;transition:all .15s ease;flex-shrink:0}
.icon-btn:hover{color:var(--text-primary);border-color:var(--border-hover);background:var(--bg-hover)}
.icon-btn.danger:hover{color:var(--delete);border-color:rgba(248,113,113,.45);background:var(--delete-bg)}
.detail-meta{display:flex;gap:20px;margin-bottom:20px}
.meta-item{font-size:.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:4px}
.detail-status-codes{display:flex;gap:8px;margin-bottom:28px;flex-wrap:wrap}
.status-pill{font-size:.75rem;font-weight:600;padding:4px 12px;border-radius:20px;font-family:var(--font-mono)}
.status-pill.s2xx{background:rgba(52,211,153,.12);color:#34d399}
.status-pill.s3xx{background:rgba(96,165,250,.12);color:#60a5fa}
.status-pill.s4xx{background:rgba(251,191,36,.12);color:#fbbf24}
.status-pill.s5xx{background:rgba(248,113,113,.12);color:#f87171}

/* Sections */
.section{margin-bottom:32px}
.section-title{font-size:.85rem;font-weight:600;color:var(--text-secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
.no-data{color:var(--text-muted);font-size:.8rem;font-style:italic;padding:16px}

/* Tabs */
.tabs{display:flex;gap:4px;margin-bottom:8px}
.tab{font-size:.7rem;font-weight:500;padding:4px 12px;border-radius:var(--radius-xs);cursor:pointer;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid transparent;transition:all .15s ease}
.tab:hover{color:var(--text-primary)}
.tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}

/* Code Block */
.code-block-wrapper{position:relative}
.code-block{background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius);padding:16px;font-family:var(--font-mono);font-size:.78rem;line-height:1.7;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto}
.code-block::-webkit-scrollbar{width:4px;height:4px}
.code-block::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.copy-btn{position:absolute;top:8px;right:8px;background:var(--bg-hover);border:1px solid var(--border);color:var(--text-secondary);padding:4px 10px;border-radius:var(--radius-xs);font-size:.7rem;cursor:pointer;transition:all .15s ease;font-family:var(--font-sans)}
.copy-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}

/* JSON Syntax Highlighting */
.json-key{color:#818cf8}.json-string{color:#34d399}.json-number{color:#fbbf24}.json-bool{color:#f87171}.json-null{color:#f87171;font-style:italic}

/* Query Params */
.param-table{width:100%;border-collapse:collapse}
.param-table th,.param-table td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:.8rem}
.param-table th{color:var(--text-muted);font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px}
.param-table td{color:var(--text-secondary);font-family:var(--font-mono)}

/* Try Request */
.try-panel{border:1px solid var(--border);background:var(--bg-secondary);border-radius:var(--radius);padding:12px}
.try-row{display:grid;grid-template-columns:110px minmax(0,1fr) 88px;gap:8px;margin-bottom:10px}
.try-method,.try-path,.try-body{background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:var(--font-sans);outline:none}
.try-method{padding:0 10px;font-weight:700}
.try-path{padding:10px 12px;font-family:var(--font-mono);font-size:.82rem}
.try-body{width:100%;min-height:128px;resize:vertical;padding:12px;font-family:var(--font-mono);font-size:.78rem;line-height:1.6;margin-bottom:10px}
.try-method:focus,.try-path:focus,.try-body:focus{border-color:var(--accent)}
.run-btn{border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-weight:700;cursor:pointer;transition:all .15s ease}
.run-btn:hover{background:var(--accent-hover)}
.run-btn:disabled{opacity:.55;cursor:wait}
.try-result{border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.try-result-head{display:flex;gap:10px;align-items:center;padding:10px 12px;background:var(--bg-tertiary);border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text-secondary)}
.try-result-head strong{color:var(--text-primary);font-family:var(--font-mono)}
.try-error{color:var(--delete);padding:12px;font-size:.82rem}

/* Responsive */
@media(max-width:768px){
  .sidebar{width:100%;min-width:auto;max-height:40vh;border-right:none;border-bottom:1px solid var(--border)}
  .main-layout{flex-direction:column}
  .topbar-stats{display:none}
  .try-row{grid-template-columns:1fr}
  .run-btn{height:38px}
}
`;
}

function getJS(docsPath) {
  return `
(function(){
  const API_URL = '${docsPath}/api.json';
  const SSE_URL = '${docsPath}/stream';
  const ENDPOINT_URL = '${docsPath}/endpoint';
  const TRY_URL = '${docsPath}/try';

  let endpoints = [];
  let selectedKey = null;

  // --- Init ---
  fetchDocs();
  connectSSE();

  document.getElementById('search-input').addEventListener('input', (e) => {
    renderSidebar(endpoints, e.target.value.toLowerCase());
  });
  document.getElementById('delete-endpoint-btn').addEventListener('click', deleteSelectedEndpoint);
  document.getElementById('try-run-btn').addEventListener('click', runSelectedEndpoint);

  // --- Fetch all docs ---
  async function fetchDocs() {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      endpoints = data.endpoints || [];
      updateStats(data.stats);
      renderSidebar(endpoints);
      if (selectedKey) {
        const ep = endpoints.find(e => e.method + ' ' + e.path === selectedKey);
        if (ep) renderDetail(ep);
        if (!ep) {
          selectedKey = null;
          document.getElementById('endpoint-detail').style.display = 'none';
          document.getElementById('welcome').style.display = 'flex';
        }
      }
    } catch(e) { console.error('[docify] fetch error', e); }
  }

  // --- SSE ---
  function connectSSE() {
    const es = new EventSource(SSE_URL);
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'update' || msg.type === 'clear' || msg.type === 'delete') fetchDocs();
      } catch(e) {}
    };
    es.onerror = () => {
      document.getElementById('live-badge').style.opacity = '0.3';
    };
    es.onopen = () => {
      document.getElementById('live-badge').style.opacity = '1';
    };
  }

  // --- Stats ---
  function updateStats(stats) {
    if (!stats) return;
    document.getElementById('stat-endpoints').textContent = stats.totalEndpoints || 0;
    document.getElementById('stat-requests').textContent = stats.totalRequests || 0;
  }

  // --- Sidebar ---
  function renderSidebar(eps, filter) {
    const list = document.getElementById('endpoint-list');
    const empty = document.getElementById('empty-state');

    const filtered = filter ? eps.filter(e => e.path.toLowerCase().includes(filter) || e.method.toLowerCase().includes(filter)) : eps;

    if (filtered.length === 0 && !filter) {
      empty.style.display = 'flex';
      // Remove old items except empty state
      Array.from(list.children).forEach(c => { if (c !== empty) c.remove(); });
      return;
    }
    empty.style.display = 'none';

    // Group by resource
    const groups = {};
    filtered.forEach(ep => {
      const g = extractGroup(ep.path);
      if (!groups[g]) groups[g] = [];
      groups[g].push(ep);
    });

    let html = '';
    const sortedGroups = Object.keys(groups).sort();
    sortedGroups.forEach(g => {
      html += '<div class="group-label">' + escHtml(g) + '</div>';
      groups[g].forEach(ep => {
        const key = ep.method + ' ' + ep.path;
        const active = key === selectedKey ? ' active' : '';
        html += '<div class="endpoint-item' + active + '" data-key="' + escHtml(key) + '">'
          + '<span class="method-badge ' + ep.method.toLowerCase() + '">' + ep.method + '</span>'
          + '<span class="ep-path">' + escHtml(ep.path) + '</span>'
          + '<span class="ep-hits">' + ep.hitCount + 'x</span>'
          + '</div>';
      });
    });

    // Keep empty state element, replace the rest
    const frag = document.createElement('div');
    frag.innerHTML = html;
    Array.from(list.children).forEach(c => { if (c !== empty) c.remove(); });
    while (frag.firstChild) list.appendChild(frag.firstChild);

    // Click handlers
    list.querySelectorAll('.endpoint-item').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.dataset.key;
        selectedKey = key;
        const ep = endpoints.find(e => e.method + ' ' + e.path === key);
        if (ep) renderDetail(ep);
        list.querySelectorAll('.endpoint-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  // --- Detail ---
  function renderDetail(ep) {
    document.getElementById('welcome').style.display = 'none';
    const detail = document.getElementById('endpoint-detail');
    detail.style.display = 'block';

    document.getElementById('detail-method').className = 'method-badge ' + ep.method.toLowerCase();
    document.getElementById('detail-method').textContent = ep.method;
    document.getElementById('detail-path').textContent = ep.path;
    document.getElementById('detail-hits').textContent = '🔥 ' + ep.hitCount + ' requests';
    document.getElementById('detail-last-used').textContent = '🕐 ' + timeAgo(ep.lastUsed);

    // Status codes
    const scEl = document.getElementById('detail-status-codes');
    scEl.innerHTML = ep.statusCodes.map(code => {
      const cls = code < 300 ? 's2xx' : code < 400 ? 's3xx' : code < 500 ? 's4xx' : 's5xx';
      return '<span class="status-pill ' + cls + '">' + code + '</span>';
    }).join('');

    // Request examples
    renderExamples('request', ep.requestExamples, (ex) => ({
      query: Object.keys(ex.query || {}).length > 0 ? ex.query : undefined,
      body: ex.body
    }));

    // Response examples
    renderExamples('response', ep.responseExamples, (ex) => ({
      status: ex.statusCode,
      body: ex.body
    }));

    // Query params
    const qpSection = document.getElementById('query-params-section');
    if (ep.queryParams && ep.queryParams.length > 0) {
      qpSection.style.display = 'block';
      document.getElementById('query-params').innerHTML =
        '<table class="param-table"><thead><tr><th>Parameter</th></tr></thead><tbody>'
        + ep.queryParams.map(p => '<tr><td>' + escHtml(p) + '</td></tr>').join('')
        + '</tbody></table>';
    } else {
      qpSection.style.display = 'none';
    }

    setupTryPanel(ep);
  }

  async function deleteSelectedEndpoint() {
    if (!selectedKey) return;
    const ep = endpoints.find(e => e.method + ' ' + e.path === selectedKey);
    if (!ep) return;
    const ok = confirm('Delete ' + ep.method + ' ' + ep.path + ' from Docify?');
    if (!ok) return;

    try {
      const res = await fetch(ENDPOINT_URL, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: ep.method, path: ep.path })
      });
      if (!res.ok) throw new Error('Delete failed');
      selectedKey = null;
      await fetchDocs();
    } catch (e) {
      alert(e.message || 'Could not delete endpoint');
    }
  }

  function setupTryPanel(ep) {
    const methodEl = document.getElementById('try-method');
    const pathEl = document.getElementById('try-path');
    const bodyEl = document.getElementById('try-body');
    const resultEl = document.getElementById('try-result');
    const latestRequest = ep.requestExamples && ep.requestExamples.length
      ? ep.requestExamples[ep.requestExamples.length - 1]
      : null;
    const query = latestRequest && latestRequest.query && Object.keys(latestRequest.query).length
      ? '?' + new URLSearchParams(latestRequest.query).toString()
      : '';

    methodEl.value = ep.method;
    pathEl.value = ep.path + query;
    bodyEl.value = latestRequest && latestRequest.body ? JSON.stringify(latestRequest.body, null, 2) : '';
    bodyEl.style.display = ['GET', 'HEAD'].includes(ep.method) ? 'none' : 'block';
    resultEl.style.display = 'none';
    resultEl.innerHTML = '';

    methodEl.onchange = () => {
      bodyEl.style.display = ['GET', 'HEAD'].includes(methodEl.value) ? 'none' : 'block';
    };
  }

  async function runSelectedEndpoint() {
    const method = document.getElementById('try-method').value;
    const path = document.getElementById('try-path').value.trim();
    const bodyText = document.getElementById('try-body').value.trim();
    const resultEl = document.getElementById('try-result');
    const btn = document.getElementById('try-run-btn');
    let body;

    if (!path.startsWith('/')) {
      renderTryError('Path must start with /');
      return;
    }

    if (!['GET', 'HEAD'].includes(method) && bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch (e) {
        renderTryError('Request body must be valid JSON');
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Running';
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="try-result-head">Sending request...</div>';

    try {
      const res = await fetch(TRY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, path, body })
      });
      const data = await res.json();
      renderTryResult(data);
      setTimeout(fetchDocs, 200);
    } catch (e) {
      renderTryError(e.message || 'Request failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run';
    }
  }

  function renderTryResult(data) {
    const resultEl = document.getElementById('try-result');
    const status = data.statusCode || 'ERR';
    const duration = data.durationMs !== undefined ? data.durationMs + 'ms' : '';
    const json = JSON.stringify(data.body !== undefined ? data.body : data, null, 2);
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="try-result-head"><strong>' + escHtml(String(status)) + '</strong><span>' + escHtml(duration) + '</span></div>'
      + '<div class="code-block-wrapper"><button class="copy-btn" onclick="copyCode(this)">Copy</button><pre class="code-block">' + highlightJSON(json) + '</pre></div>';
  }

  function renderTryError(message) {
    const resultEl = document.getElementById('try-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div class="try-error">' + escHtml(message) + '</div>';
  }

  function renderExamples(prefix, examples, transform) {
    const tabsEl = document.getElementById(prefix + '-tabs');
    const wrapperEl = document.getElementById(prefix + '-examples');

    if (!examples || examples.length === 0) {
      tabsEl.innerHTML = '';
      wrapperEl.innerHTML = '<p class="no-data">No ' + prefix + ' data captured</p>';
      return;
    }

    // Tabs
    tabsEl.innerHTML = examples.map((_, i) =>
      '<div class="tab' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">Example ' + (i+1) + '</div>'
    ).join('');

    // Show first
    showExample(prefix, examples, 0, transform, wrapperEl);

    tabsEl.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        showExample(prefix, examples, parseInt(tab.dataset.idx), transform, wrapperEl);
      });
    });
  }

  function showExample(prefix, examples, idx, transform, wrapper) {
    const data = transform(examples[idx]);
    const json = JSON.stringify(data, null, 2);
    wrapper.innerHTML = '<div class="code-block-wrapper"><button class="copy-btn" onclick="copyCode(this)">Copy</button><pre class="code-block">' + highlightJSON(json) + '</pre></div>';
  }

  // --- Utilities ---
  function extractGroup(path) {
    const segs = path.split('/').filter(Boolean).filter(s => !/^(api|v\\d+)$/i.test(s) && !s.startsWith(':'));
    return segs[0] || 'root';
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function timeAgo(iso) {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return Math.floor(diff/1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
    return Math.floor(diff/86400000) + 'd ago';
  }

  function highlightJSON(json) {
    return json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"([^"\\\\]*(\\\\.[^"\\\\]*)*)"\s*:/g, '<span class="json-key">"$1"</span>:')
      .replace(/:\s*"([^"\\\\]*(\\\\.[^"\\\\]*)*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/:\s*(-?\\d+\\.?\\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
  }

  // Global copy function
  window.copyCode = function(btn) {
    const pre = btn.parentElement.querySelector('pre');
    navigator.clipboard.writeText(pre.textContent).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  };
})();
`;
}

module.exports = { mountDocsRoutes };
