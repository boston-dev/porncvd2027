'use strict';
const Jav = require('../models/Jav');

/**
 * Render a unified fallback page for 404 / errors.
 * - Shows random N videos to keep users engaged.
 * - Never throws; if DB fails, degrades gracefully.
 */
module.exports = async function renderFallback(req, res, opts = {}) {
  const {
    status = 404,
    view = 'boot',  // use your online template view
    limit = 16,
    message = '',
  } = opts;

  try {
    // Random sample (fast enough with index; if huge collection, consider precomputed list/cache)
    const docs = await Jav.aggregate([
      { $match: { disable: { $ne: 1 } } },
      { $sample: { size: limit } },
      { $project: { title: 1, img: 1, site: 1, tag: 1, date: 1 } },
    ]);

    // Keep shape similar to your existing boot render usage
    const payload = {
      docs,
      page: 1,
      total: docs.length,
      q: '',
      message,
    };

    return res.status(status).render(view, payload);
  } catch (e) {
    // DB down or aggregate failed — return minimal page without leaking details
    return res.status(status).send(status === 404 ? 'Not Found' : 'Server Error');
  }
};
