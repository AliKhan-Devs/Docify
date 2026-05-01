'use strict';

/**
 * Docify Sanitizer
 * 
 * Detects and masks sensitive fields in request/response payloads.
 * Deep-clones objects before sanitizing — never mutates originals.
 */

const DEFAULT_SENSITIVE_PATTERNS = [
  /^pass(word|wd)?$/i,
  /^secret$/i,
  /^token$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^api[_-]?(key|token|secret)$/i,
  /^auth(orization)?$/i,
  /^cookie$/i,
  /^session$/i,
  /^credit[_-]?card$/i,
  /^card[_-]?number$/i,
  /^cvv$/i,
  /^ssn$/i,
  /^private[_-]?key$/i,
  /^x-api-key$/i,
];

const REDACTED = '[REDACTED]';

class Sanitizer {
  /**
   * @param {Object} options
   * @param {string[]} [options.additionalFields] - Extra field names to redact
   * @param {boolean} [options.enabled] - Whether sanitization is active
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.patterns = [...DEFAULT_SENSITIVE_PATTERNS];

    if (options.additionalFields && Array.isArray(options.additionalFields)) {
      for (const field of options.additionalFields) {
        this.patterns.push(new RegExp(`^${escapeRegex(field)}$`, 'i'));
      }
    }
  }

  /**
   * Sanitize an object by masking sensitive fields.
   * Returns a deep clone — original is never mutated.
   * 
   * @param {*} data - The data to sanitize
   * @returns {*} Sanitized deep clone
   */
  sanitize(data) {
    if (!this.enabled || data === null || data === undefined) {
      return data;
    }

    return this._sanitizeValue(data, 0);
  }

  /**
   * Sanitize HTTP headers object.
   * 
   * @param {Object} headers
   * @returns {Object} Sanitized headers clone
   */
  sanitizeHeaders(headers) {
    if (!this.enabled || !headers || typeof headers !== 'object') {
      return headers;
    }

    const result = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this._isSensitive(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * @private
   */
  _sanitizeValue(value, depth) {
    // Guard against circular refs / extremely deep objects
    if (depth > 20) return value;

    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this._sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        if (this._isSensitive(key)) {
          result[key] = REDACTED;
        } else {
          result[key] = this._sanitizeValue(val, depth + 1);
        }
      }
      return result;
    }

    return value;
  }

  /**
   * Check if a field name matches any sensitive pattern.
   * @private
   * @param {string} fieldName
   * @returns {boolean}
   */
  _isSensitive(fieldName) {
    return this.patterns.some(pattern => pattern.test(fieldName));
  }
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { Sanitizer, REDACTED, DEFAULT_SENSITIVE_PATTERNS };
