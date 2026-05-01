'use strict';

/**
 * Docify Documentation Generator
 * 
 * Transforms Route Registry data into structured documentation JSON.
 */

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

class DocGenerator {
  /**
   * @param {import('../core/routeRegistry').RouteRegistry} registry
   */
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * Generate the full API documentation as a structured JSON object.
   * @returns {Object}
   */
  generate() {
    const endpoints = this.registry.getAll();
    const stats = this.registry.getStats();

    // Sort endpoints: by path alphabetically, then by method order
    const sorted = endpoints.sort((a, b) => {
      const pathCompare = a.path.localeCompare(b.path);
      if (pathCompare !== 0) return pathCompare;
      return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
    });

    // Group by resource (first meaningful path segment)
    const grouped = this._groupByResource(sorted);

    return {
      name: 'API Documentation',
      generatedAt: new Date().toISOString(),
      endpoints: sorted,
      groups: grouped,
      stats,
    };
  }

  /**
   * Group endpoints by their root resource path.
   * e.g., /api/users/:id and /api/users both go into "users" group.
   * 
   * @private
   * @param {Object[]} endpoints
   * @returns {Object} Map of group name to endpoints
   */
  _groupByResource(endpoints) {
    const groups = {};

    for (const endpoint of endpoints) {
      const groupName = this._extractGroupName(endpoint.path);
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(endpoint);
    }

    return groups;
  }

  /**
   * Extract a human-friendly group name from a path.
   * "/api/v1/users/:id" → "users"
   * "/health" → "health"
   * 
   * @private
   * @param {string} path
   * @returns {string}
   */
  _extractGroupName(path) {
    const segments = path.split('/').filter(Boolean);

    // Skip common prefixes like "api", "v1", "v2"
    const meaningfulSegments = segments.filter(
      seg => !/^(api|v\d+)$/i.test(seg) && !seg.startsWith(':')
    );

    return meaningfulSegments[0] || 'root';
  }
}

module.exports = { DocGenerator };
