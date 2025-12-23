'use strict';

const Jav = require('../models/Jav');

module.exports = async function renderFallback(req, res, opts = {}) {
  const {
    status = 404,
    view = 'boot',
    limit = 16,
    message = '',
    days = 30,
    dateField = 'date', // 你的 ms 时间戳字段
  } = opts;

  try {
    const sinceTs = Date.now() - days * 24 * 60 * 60 * 1000; // ms

    // 1) 最近N天随机
    let docs = await Jav.aggregate([
      {
        $match: {
          disable: { $ne: 1 },
          [dateField]: { $gte: sinceTs },
        },
      },
      { $sample: { size: limit } },
      { $project: { title: 1, img: 1, site: 1, tag: 1, date: 1,source:1,site:1  } },
    ]);
    // 2) 不足就全站随机补齐
    if (docs.length < limit) {
      const need = limit - docs.length;
      const existingIds = docs.map(d => d._id);

      const more = await Jav.aggregate([
        { $match: { disable: { $ne: 1 }, _id: { $nin: existingIds } } },
        { $sample: { size: need } },
        { $project: { title: 1, img: 1, site: 1, tag: 1, date: 1,source:1,site:1 } },
      ]);

      docs = docs.concat(more);
    }

    return res.status(status).render(view, {
      docs,
      page: 1,
      total: docs.length,
      q: '',
      message,
    });
  } catch (e) {
    return res.status(status).send(status === 404 ? 'Not Found' : 'Server Error');
  }
};
