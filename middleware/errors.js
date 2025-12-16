'use strict';

const renderFallback = require('../utils/renderFallback');

function isAssetRequest(req) {
  const p = (req.path || req.originalUrl || '').split('?')[0];

  // static mount
  if (p.startsWith('/public/')) return true;

  // common asset extensions
  return /\.(css|js|mjs|map|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|mp4|m3u8|ts)$/i.test(p);
}

function isApiRequest(req) {
  const p = (req.path || req.originalUrl || '').split('?')[0];
  return p.startsWith('/api/') || (req.headers.accept || '').includes('application/json') || req.xhr;
}

async function notFound(req, res) {
  // ✅ Assets/API should NOT render HTML fallback
  if (isAssetRequest(req) || isApiRequest(req)) {
    return res.status(404).send('Not Found');
  }
  // ✅ Unified 404 page: show random 16 videos
  return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
}

async function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const rid = req && (req.id || req.headers['x-request-id']);
  console.error('[ERR]', {
    rid,
    method: req.method,
    url: req.originalUrl,
    message: err && err.message,
    name: err && err.name,
  });

  // ✅ Assets/API should NOT render HTML fallback
  if (isAssetRequest(req) || isApiRequest(req)) {
    return res.status(500).send('Server Error');
  }

  // ✅ Unified error page: show random 16 videos
  return renderFallback(req, res, { status: 500, view: 'boot', limit: 16 });
}

module.exports = { notFound, errorHandler };
