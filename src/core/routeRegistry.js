'use strict';

const { EventEmitter } = require('events');
const logger = require('./logger');

/**
 * Docify Route Registry
 * 
 * In-memory store for all captured API endpoint data.
 * Automatically detects parameterized routes and merges duplicate endpoints.
 * Emits "update" events for SSE live sync.
 */

// Patterns for detecting dynamic URL segments
const DYNAMIC_SEGMENT_PATTERNS = [
  /^\d+$/,                                                         // Pure numeric: 123
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,  // UUID
  /^[0-9a-f]{24}$/i,                                              // MongoDB ObjectId
  /^[0-9a-f]{8,}$/i,                                              // Long hex strings
];

class RouteRegistry extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} [options.maxExamples=5] - Max examples stored per endpoint
   */
  constructor(options = {}) {
    super();
    this.maxExamples = options.maxExamples || 5;
    /** @type {Map<string, EndpointRecord>} */
    this.endpoints = new Map();
  }

  /**
   * Normalize a URL path by replacing dynamic segments with :param placeholders.
   * 
   * @param {string} path - The raw URL path (e.g., "/users/123/posts/abc-def")
   * @returns {string} Normalized path (e.g., "/users/:id/posts/:id")
   */
  normalizePath(path) {
    // Remove query string if present
    const cleanPath = path.split('?')[0];

    const segments = cleanPath.split('/');
    const normalized = segments.map(segment => {
      if (!segment) return segment;
      if (DYNAMIC_SEGMENT_PATTERNS.some(pattern => pattern.test(segment))) {
        return ':id';
      }
      return segment;
    });

    return normalized.join('/') || '/';
  }

  /**
   * Register an API call observation.
   * 
   * @param {Object} entry
   * @param {string} entry.method - HTTP method
   * @param {string} entry.path - URL path
   * @param {Object} [entry.requestBody] - Request body
   * @param {Object} [entry.requestQuery] - Query parameters
   * @param {Object} [entry.requestHeaders] - Request headers
   * @param {string} [entry.requestContentType] - Request content type
   * @param {*} [entry.responseBody] - Response body
   * @param {number} [entry.statusCode] - HTTP status code
   * @param {string} [entry.responseContentType] - Response content type
   */
  register(entry) {
    const method = entry.method.toUpperCase();
    const normalizedPath = this.normalizePath(entry.path);
    const key = `${method} ${normalizedPath}`;

    let record = this.endpoints.get(key);

    if (!record) {
      record = {
        method,
        path: normalizedPath,
        requestExamples: [],
        responseExamples: [],
        statusCodes: new Set(),
        queryParams: new Set(),
        headerKeys: new Set(),
        lastUsed: null,
        hitCount: 0,
        requestContentTypes: new Set(),
        responseContentTypes: new Set(),
      };
      this.endpoints.set(key, record);
    }

    const now = new Date().toISOString();
    record.lastUsed = now;
    record.hitCount++;

    // Capture status code
    if (entry.statusCode) {
      record.statusCodes.add(entry.statusCode);
    }

    // Capture query param keys
    if (entry.requestQuery && typeof entry.requestQuery === 'object') {
      for (const key of Object.keys(entry.requestQuery)) {
        record.queryParams.add(key);
      }
    }

    // Capture header keys
    if (entry.requestHeaders && typeof entry.requestHeaders === 'object') {
      for (const key of Object.keys(entry.requestHeaders)) {
        record.headerKeys.add(key.toLowerCase());
      }
    }

    // Capture content types
    if (entry.requestContentType) {
      record.requestContentTypes.add(entry.requestContentType);
    }
    if (entry.responseContentType) {
      record.responseContentTypes.add(entry.responseContentType);
    }

    // Store request example (capped)
    const requestExample = {
      body: entry.requestBody || null,
      query: entry.requestQuery || {},
      contentType: entry.requestContentType || null,
      capturedAt: now,
    };

    // Only add if body or query is non-empty
    if (requestExample.body || Object.keys(requestExample.query).length > 0) {
      record.requestExamples.push(requestExample);
      if (record.requestExamples.length > this.maxExamples) {
        record.requestExamples.shift();
      }
    }

    // Store response example (capped)
    if (entry.responseBody !== undefined || entry.statusCode) {
      const responseExample = {
        statusCode: entry.statusCode || null,
        body: entry.responseBody || null,
        contentType: entry.responseContentType || null,
        capturedAt: now,
      };
      record.responseExamples.push(responseExample);
      if (record.responseExamples.length > this.maxExamples) {
        record.responseExamples.shift();
      }
    }

    logger.info(`Registered: ${key} (${record.hitCount} hits)`);
    this.emit('update', { key, record: this._serializeRecord(record) });
  }

  /**
   * Get all registered endpoints.
   * @returns {Object[]} Array of serialized endpoint records
   */
  getAll() {
    const results = [];
    for (const record of this.endpoints.values()) {
      results.push(this._serializeRecord(record));
    }
    return results;
  }

  /**
   * Get a specific endpoint by method and path.
   * @param {string} method
   * @param {string} path
   * @returns {Object|null}
   */
  getByRoute(method, path) {
    const normalizedPath = this.normalizePath(path);
    const key = `${method.toUpperCase()} ${normalizedPath}`;
    const record = this.endpoints.get(key);
    return record ? this._serializeRecord(record) : null;
  }

  /**
   * Clear all stored data.
   */
  clear() {
    this.endpoints.clear();
    logger.info('Registry cleared');
    this.emit('clear');
  }

  /**
   * Get aggregate stats.
   * @returns {Object}
   */
  getStats() {
    let totalRequests = 0;
    for (const record of this.endpoints.values()) {
      totalRequests += record.hitCount;
    }
    return {
      totalEndpoints: this.endpoints.size,
      totalRequests,
    };
  }

  /**
   * Convert Sets to arrays for JSON serialization.
   * @private
   */
  _serializeRecord(record) {
    return {
      method: record.method,
      path: record.path,
      requestExamples: [...record.requestExamples],
      responseExamples: [...record.responseExamples],
      statusCodes: [...record.statusCodes].sort((a, b) => a - b),
      queryParams: [...record.queryParams],
      headerKeys: [...record.headerKeys],
      lastUsed: record.lastUsed,
      hitCount: record.hitCount,
      requestContentTypes: [...record.requestContentTypes],
      responseContentTypes: [...record.responseContentTypes],
    };
  }
}

module.exports = { RouteRegistry };
