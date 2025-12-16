'use strict';
const rateLimit = require('express-rate-limit');

// Global baseline limiter (tune per your traffic)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // 600 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
});

// Stronger limiter for detail pages (anti-scrape / anti-DoS)
const detailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 req/min/IP
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, detailLimiter };
