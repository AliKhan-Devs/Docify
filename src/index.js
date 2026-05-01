'use strict';

const { Sanitizer } = require('./core/sanitizer');
const { RouteRegistry } = require('./core/routeRegistry');
const { DocGenerator } = require('./docs/generator');
const { createCaptureMiddleware } = require('./middleware/captureMiddleware');
const { mountDocsRoutes } = require('./docs/uiServer');
const logger = require('./core/logger');

/**
 * Docify — Zero-config API documentation middleware for Express.
 * 
 * Usage:
 *   const docify = require('docify');
 *   app.use(docify());
 * 
 * @param {Object} [options]
 * @param {string}   [options.docsPath="/docs"]       - URL path for documentation UI
 * @param {boolean}  [options.sanitize=true]           - Enable sensitive field masking
 * @param {boolean}  [options.enabled=true]            - Master switch
 * @param {number}   [options.maxExamples=5]           - Max request/response examples per endpoint
 * @param {string[]} [options.sensitiveFields=[]]      - Additional field names to redact
 * @param {string[]} [options.ignorePaths=[]]          - Paths to exclude from capture
 * @param {boolean}  [options.captureHeaders=false]    - Whether to capture request/response headers
 * @param {boolean}  [options.persist=true]            - Persist captured docs across restarts
 * @param {string}   [options.storagePath]             - JSON file used for persisted docs
 * @returns {Function} Express middleware
 */
function docify(options = {}) {
  const {
    docsPath = '/docs',
    sanitize = true,
    enabled = true,
    maxExamples = 5,
    sensitiveFields = [],
    ignorePaths = [],
    captureHeaders = false,
    persist = true,
    storagePath,
  } = options;

  // Check if Docify should be disabled
  const isEnabled = enabled && process.env.DOCIFY_ENABLED !== 'false';

  if (!isEnabled) {
    logger.info('Docify is disabled');
    return function docifyNoOp(req, res, next) { next(); };
  }

  // Create shared instances
  const sanitizer = new Sanitizer({
    enabled: sanitize,
    additionalFields: sensitiveFields,
  });

  const registry = new RouteRegistry({ maxExamples, persist, storagePath });
  const generator = new DocGenerator(registry);

  // Create the capture middleware
  const captureMiddleware = createCaptureMiddleware({
    registry,
    sanitizer,
    docsPath,
    ignorePaths,
    captureHeaders,
  });

  logger.info(`Docify initialized — docs at ${docsPath}`);

  /**
   * The returned middleware function.
   * On first call, it mounts the docs routes onto the Express app.
   * On every call, it runs the capture middleware.
   */
  let mounted = false;

  return function docifyMiddleware(req, res, next) {
    // Lazily mount docs routes on first request
    // This gives us access to req.app (the Express app instance)
    if (!mounted) {
      mounted = true;
      mountDocsRoutes(req.app, {
        docsPath,
        generator,
        registry,
      });
      logger.info('Docs routes mounted');
    }

    // Run capture middleware
    captureMiddleware(req, res, next);
  };
}

// Also export internals for advanced usage / testing
docify.Sanitizer = Sanitizer;
docify.RouteRegistry = RouteRegistry;
docify.DocGenerator = DocGenerator;

module.exports = docify;
