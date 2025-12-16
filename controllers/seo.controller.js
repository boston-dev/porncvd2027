'use strict';
const asyncHandler = require('../utils/asyncHandler');
const Jav = require('../models/Jav');

function getSiteUrl(req) {
  // Prefer explicit SITE_URL
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

exports.robots = asyncHandler(async (req, res) => {
  res.type('text/plain');
  const siteUrl = getSiteUrl(req);
  res.send(`User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
`);
});

exports.sitemap = asyncHandler(async (req, res) => {
  const siteUrl = getSiteUrl(req);
  res.type('application/xml');

  // Only output last N urls to keep sitemap lightweight.
  const docs = await Jav.find({ disable: { $ne: 1 } })
    .sort({ date: -1 })
    .limit(5000)
    .select({ _id: 1, date: 1 });

  const urls = docs.map(d => {
    const lastmod = d.date ? new Date(Number(d.date)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `<url><loc>${siteUrl}/javs/${d._id}.html</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join('');

  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
