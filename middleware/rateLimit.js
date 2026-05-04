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

/**
 * 生成分页 range
 * @param {Object} data - 必须包含 page, totalPages
 * @param {Object} option - 可选 { prelink: '/list/pageTpl.html' }
 * @param {number} size - 当前页前后展示的页数（默认3）
 * @returns {Object} newData - 返回带 range 的 data
 */
function withPageRange(data, option = {}, size = 3) {
  const page = Number(data?.page || 1);
  const totalPages = Number(data?.totalPages || 1);
  const prelink = option?.prelink || '';

  const makeHref = (num) => (prelink ? prelink.replace('pageTpl', String(num)) : '');

  const current = [{
    href: '',
    class: 'active',
    text: page
  }];

  // 右侧页码
  for (let num = page + 1; num <= page + size; num++) {
    if (num <= totalPages) {
      current.push({ href: makeHref(num), text: num });
    }
  }

  // 左侧页码
  const left = [];
  for (let num = page - size; num < page; num++) {
    if (num > 0) {
      left.push({ href: makeHref(num), text: num });
    }
  }

  // 合并
  let range = [...left, ...current];

  // 补齐尾页
  if (totalPages >= 1 && range.findIndex(v => v.text == totalPages) < 0) {
    range.push({ href: makeHref(totalPages), text: totalPages });
  }

  // 补齐首页
  if (range.findIndex(v => v.text == 1) < 0) {
    range.unshift({ href: makeHref(1), text: 1 });
  }

  // 去重（防止 page=1 或 page=totalPages 时重复）
  const seen = new Set();
  range = range.filter(item => {
    const key = String(item.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ...data, range };
}
// const newData = withPageRange({ page: 5, totalPages: 20 }, { prelink: '/list/pageTpl.html' });
// console.log(newData.range);

module.exports = { generalLimiter, detailLimiter,withPageRange };
