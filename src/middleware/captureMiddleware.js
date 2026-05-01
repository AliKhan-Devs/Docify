'use strict';

const logger = require('../core/logger');

/**
 * Docify Capture Middleware
 * 
 * Intercepts Express req/res to capture API usage data.
 * Uses res.write/res.end monkey-patching for reliable response body capture.
 */

// Max response body size to capture (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// Content types we actually want to capture
const CAPTURABLE_CONTENT_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'text/xml',
  'application/xml',
  'application/x-www-form-urlencoded',
];

/**
 * Creates the capture middleware.
 * 
 * @param {Object} options
 * @param {import('../core/routeRegistry').RouteRegistry} options.registry
 * @param {import('../core/sanitizer').Sanitizer} options.sanitizer
 * @param {string} options.docsPath - The docs UI path to exclude from capture
 * @param {string[]} [options.ignorePaths] - Additional paths to ignore
 * @param {boolean} [options.captureHeaders] - Whether to capture headers
 * @returns {Function} Express middleware
 */
function createCaptureMiddleware(options) {
  const { registry, sanitizer, docsPath, ignorePaths = [], captureHeaders = false } = options;

  // Build the ignore list: docs path + user-specified paths
  const ignoreList = [docsPath, ...ignorePaths];

  return function docifyCaptureMiddleware(req, res, next) {
    // Skip if this request is for the docs UI itself
    if (shouldIgnore(req.path, ignoreList)) {
      return next();
    }

    const startTime = Date.now();

    // --- Capture Request Data ---
    const requestData = {
      method: req.method,
      path: req.originalUrl ? req.originalUrl.split('?')[0] : req.path,
      query: req.query || {},
      body: req.body || null,
      contentType: req.get('content-type') || null,
      headers: captureHeaders ? { ...req.headers } : null,
    };

    // --- Intercept Response ---
    const originalWrite = res.write;
    const originalEnd = res.end;
    const chunks = [];
    let totalSize = 0;
    let truncated = false;

    res.write = function docifyWrite(chunk, encoding, callback) {
      // Handle the various overloaded signatures of res.write
      if (chunk && !truncated) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
        totalSize += buffer.length;
        if (totalSize <= MAX_BODY_SIZE) {
          chunks.push(buffer);
        } else {
          truncated = true;
        }
      }
      return originalWrite.apply(res, arguments);
    };

    res.end = function docifyEnd(chunk, encoding, callback) {
      // Capture final chunk
      if (chunk && !truncated) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
        totalSize += buffer.length;
        if (totalSize <= MAX_BODY_SIZE) {
          chunks.push(buffer);
        } else {
          truncated = true;
        }
      }

      // Restore original methods immediately
      res.write = originalWrite;
      res.end = originalEnd;

      // Call original end first — never block the response
      const result = originalEnd.apply(res, arguments);

      // Process captured data asynchronously (don't delay response)
      try {
        processCapture(requestData, res, chunks, truncated, {
          registry,
          sanitizer,
          captureHeaders,
          startTime,
        });
      } catch (err) {
        logger.error('Error processing capture:', err.message);
      }

      return result;
    };

    next();
  };
}

/**
 * Process the captured request/response data and register it.
 * @private
 */
function processCapture(requestData, res, chunks, truncated, options) {
  const { registry, sanitizer, captureHeaders, startTime } = options;

  const responseContentType = res.getHeader('content-type') || '';
  const statusCode = res.statusCode;

  // Parse response body
  let responseBody = null;
  if (!truncated && chunks.length > 0) {
    const rawBody = Buffer.concat(chunks).toString('utf8');

    // Only attempt to capture text/JSON responses
    if (isCapturable(responseContentType)) {
      // Try to parse as JSON
      if (responseContentType.includes('json')) {
        try {
          responseBody = JSON.parse(rawBody);
        } catch {
          responseBody = rawBody;
        }
      } else {
        // For text content, store as string (truncate if very long)
        responseBody = rawBody.length > 10000
          ? rawBody.substring(0, 10000) + '... [truncated]'
          : rawBody;
      }
    }
  } else if (truncated) {
    responseBody = '[Response body too large - truncated]';
  }

  // Sanitize data
  const sanitizedRequestBody = sanitizer.sanitize(requestData.body);
  const sanitizedResponseBody = sanitizer.sanitize(responseBody);
  const sanitizedQuery = sanitizer.sanitize(requestData.query);
  const sanitizedHeaders = captureHeaders
    ? sanitizer.sanitizeHeaders(requestData.headers)
    : null;

  // Register with route registry
  registry.register({
    method: requestData.method,
    path: requestData.path,
    requestBody: sanitizedRequestBody,
    requestQuery: sanitizedQuery,
    requestHeaders: sanitizedHeaders,
    requestContentType: requestData.contentType,
    responseBody: sanitizedResponseBody,
    statusCode,
    responseContentType: typeof responseContentType === 'string'
      ? responseContentType.split(';')[0].trim()
      : null,
  });

  const duration = Date.now() - startTime;
  logger.info(`${requestData.method} ${requestData.path} → ${statusCode} (${duration}ms)`);
}

/**
 * Check if a path should be ignored.
 * @private
 */
function shouldIgnore(path, ignoreList) {
  return ignoreList.some(ignorePath => {
    if (!ignorePath) return false;
    return path === ignorePath || path.startsWith(ignorePath + '/');
  });
}

/**
 * Check if a content type is worth capturing.
 * @private
 */
function isCapturable(contentType) {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return CAPTURABLE_CONTENT_TYPES.some(type => lower.includes(type));
}

module.exports = { createCaptureMiddleware };
