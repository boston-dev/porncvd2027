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
function withPageRange(data, option = {}) {
  const page = Math.max(1, Number(data?.page || 1));
  const hasNextPage = data?.hasNextPage === true;

  const prelink = option?.prelink || "";
  const makeHref = (num) =>
    prelink ? prelink.replace("pageTpl", String(num)) : "";

  const range = [];

  if (page > 1) {
    range.push({
      href: makeHref(page - 1),
      text: "‹",
      class: "prev",
      ariaLabel: "Previous page",
    });
  }

  range.push({
    href: "",
    text: page,
    class: "active",
    ariaLabel: `Page ${page}`,
  });

  if (hasNextPage) {
    range.push({
      href: makeHref(page + 1),
      text: "›",
      class: "next",
      ariaLabel: "Next page",
    });
  }

  return {
    ...data,
    range,
  };
}

async function fastPageQuery(
  Model,
  query,
  {
    page = 1,
    limit = 20,
    sort = { date: -1 },
    select = "",
    maxSkip = 2000,
  } = {}
) {
  page = Math.max(1, Number(page) || 1);
  limit = Math.max(1, Number(limit) || 20);

  const skip = (page - 1) * limit;

  if (skip > maxSkip) {
    return {
      docs: [],
      page,
      limit,
      hasNextPage: false,
    };
  }

  const docs = await Model.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit + 1)
    .select(select)
    .lean();

  const hasNextPage = docs.length > limit;

  if (hasNextPage) {
    docs.pop();
  }

  return {
    docs,
    page,
    limit,
    hasNextPage,
  };
}

module.exports = { generalLimiter, detailLimiter,withPageRange,fastPageQuery };
