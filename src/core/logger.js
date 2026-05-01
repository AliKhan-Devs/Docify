'use strict';

/**
 * Docify Internal Logger
 * 
 * Only outputs when DOCIFY_DEBUG=true environment variable is set.
 * All messages prefixed with [docify].
 */

const PREFIX = '[docify]';

function isEnabled() {
  return process.env.DOCIFY_DEBUG === 'true';
}

const logger = {
  info(...args) {
    if (isEnabled()) {
      console.log(PREFIX, ...args);
    }
  },

  warn(...args) {
    if (isEnabled()) {
      console.warn(PREFIX, '⚠', ...args);
    }
  },

  error(...args) {
    if (isEnabled()) {
      console.error(PREFIX, '✖', ...args);
    }
  },
};

module.exports = logger;
