'use strict';
const crypto = require('crypto');

function requestId() {
  return function (req, res, next) {
    const incoming = req.headers['x-request-id'];
    const rid = incoming && String(incoming).slice(0, 64) || crypto.randomBytes(8).toString('hex');
    req.id = rid;
    res.setHeader('X-Request-Id', rid);
    next();
  };
}

// Optional: extra logging on errors/timeouts
function requestLogger() {
  return function (req, res, next) {
    res.on('finish', () => {
      // You can add slow-log threshold here if needed.
    });
    next();
  };
}

module.exports = { requestId, requestLogger };
