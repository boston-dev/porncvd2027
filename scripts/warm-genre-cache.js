// scripts/warm-genre-cache.js
// 单独处理动漫缓存：1) /genre/页码 2) genreNav.json -> /tag/name/页码?site=hanime
"use strict";

const dotenv = require("dotenv");

dotenv.config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});
dotenv.config();

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs/promises");
const ejs = require("ejs");

const Jav = require("../models/Jav");
const gNav = require("../nav.json");
const genreNav = require("../genreNav.json");
const { buildListMeta } = require("../utils/buildMeta");
const { withPageRange } = require("../middleware/rateLimit");
const pageCache = require("../utils/pageCache");

const LIMIT = Number(process.env.PAGE_LIMIT || 40);
const CONCURRENCY = Number(process.env.CONCURRENCY || 80);
const GENRE_MAX_PAGE_LIMIT = process.env.GENRE_MAX_PAGE ? Number(process.env.GENRE_MAX_PAGE) : null;
const TAG_MAX_PAGE_LIMIT = process.env.TAG_MAX_PAGE ? Number(process.env.TAG_MAX_PAGE) : null;

const SITE_NAME = process.env.SITE_NAME || "porncvd";
const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:4350").replace(/\/+$/, "");
const siteArr = JSON.parse(process.env.siteArr || "[]");
const queryFirt = { disable: { $ne: 1 } };
const queryGenre = { site: "hanime", ...queryFirt };

const SELECT = "title title_en img url site tag cat date id path vipView source site";

function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeBaseLocals() {
  return {
    IndexSite: SITE_URL,
    isCN: false,
    basePath: "",
    isMobile: false,
    siteArr,
    gNav,
    genreNav,
    isProd: process.env.NODE_ENV === "production",
    frends: [],
    curSite: "hanime",
    tplLang: "",
    orders_id: "",
    t: (text) => text,
    meta: {
      title: "動漫 - H Anime 線上看",
      keywords: "動漫,里番,同人作品,Motion Anime,2d動畫,泡面番,3DCG,Cosplay,H Anime",
      desc: "動漫分類首頁，整理 hanime 動漫相關內容，包含里番、同人作品、Motion Anime、2d動畫、泡面番、3DCG、Cosplay 等分類。",
      title_en: "H Anime Online",
      keywords_en: "H Anime, anime, hentai, doujin, cosplay, 3DCG",
      desc_en: "H Anime online category pages.",
    },
  };
}

function makeMockReq({ locals, type, name, page, site: siteFilter = "hanime" }) {
  const site = new URL(SITE_URL);
  const proto = site.protocol.replace(":", "") || "https";
  const urlPath = `${locals.basePath}/${type}/${encodeURIComponent(name)}/${page}`.replace(/\/{2,}/g, "/");
  const queryString = siteFilter ? `?site=${encodeURIComponent(siteFilter)}` : "";
  const fullUrl = `${urlPath}${queryString}`;

  return {
    protocol: proto,
    hostname: site.hostname,
    host: site.host,
    path: urlPath,
    url: fullUrl,
    originalUrl: fullUrl,
    baseUrl: locals.basePath || "",
    query: siteFilter ? { site: siteFilter } : {},
    params: { name, p: String(page) },
    headers: {
      host: site.host,
      "x-forwarded-proto": proto,
      "x-forwarded-host": site.host,
    },
    get(headerName) {
      const key = String(headerName || "").toLowerCase();
      if (key === "host") return site.host;
      return this.headers[key];
    },
  };
}

async function findViewFile(viewName) {
  const viewsDir = path.join(__dirname, "../views");
  const htmlPath = path.join(viewsDir, `${viewName}.html`);
  const ejsPath = path.join(viewsDir, `${viewName}.ejs`);

  try {
    await fs.access(htmlPath);
    return htmlPath;
  } catch (_) {}

  try {
    await fs.access(ejsPath);
    return ejsPath;
  } catch (_) {}

  throw new Error(`View not found: ${htmlPath} or ${ejsPath}`);
}

async function renderTemplate(viewName, data, locals) {
  const viewPath = await findViewFile(viewName);
  return ejs.renderFile(viewPath, { ...locals, ...data }, { async: false });
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      if (currentIndex >= items.length) break;
      await worker(items[currentIndex]);
    }
  });
  await Promise.all(workers);
}

function makeGenreHtmlPath({ page }) {
  if (typeof pageCache.makeGenreHtmlPath === "function") {
    return pageCache.makeGenreHtmlPath({ lang: "tw", page });
  }
  const baseDir = pageCache.OUT_DIR || path.join(__dirname, "../.page-cache");
  return path.join(baseDir, "genre", String(page), "index.html");
}

async function getGenreMaxPage() {
  const total = await Jav.countDocuments(queryGenre);
  const dbMaxPage = Math.max(1, Math.ceil(total / LIMIT));
  return GENRE_MAX_PAGE_LIMIT ? Math.min(GENRE_MAX_PAGE_LIMIT, dbMaxPage) : dbMaxPage;
}

async function buildGenrePage(page) {
  const locals = makeBaseLocals();

  const result = await Jav.paginate(queryGenre, {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select: SELECT,
    lean: true,
    leanWithId: false,
  });

  if (!result.docs.length) return;

  Object.assign(result, {
    ...withPageRange(result, { prelink: "/genre/pageTpl" }),
    userVideo: { docs: [], title: "現正熱播中" },
    name: "動漫",
    site: "hanime",
  });

  locals.meta = {
    ...locals.meta,
    canonical: `${SITE_URL}/genre/${page}`,
    title: "動漫 - H Anime 線上看",
    keywords: "動漫,里番,同人作品,Motion Anime,2d動畫,泡面番,3DCG,Cosplay,H Anime",
    desc: "動漫分類首頁，整理 hanime 動漫相關內容，包含里番、同人作品、Motion Anime、2d動畫、泡面番、3DCG、Cosplay 等分類。",
    titlePage: "動漫視頻合集",
    descPage: "這裡整理 hanime 動漫相關內容，方便快速查找感興趣的動畫作品。",
  };

  const html = await renderTemplate("genre", result, locals).catch(async (err) => {
    if (!String((err && err.message) || "").includes("View not found")) throw err;
    return renderTemplate("index", result, locals);
  });

  const file = makeGenreHtmlPath({ page });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  console.log(`[genre] page=${page}`);
}

async function buildGenre() {
  const maxPage = await getGenreMaxPage();
  console.log(`[genre] maxPage=${maxPage}`);

  const jobs = [];
  for (let page = 1; page <= maxPage; page++) jobs.push({ page });
  await runPool(jobs, ({ page }) => buildGenrePage(page));
}

function getNameFromNavItem(item) {
  const rawHref = String(item.href || "").split("?")[0].replace(/\/+$/, "");
  const fromHref = rawHref.split("/").filter(Boolean).pop();
  return String(item.text || item.name || fromHref || "").trim();
}

function buildGenreTagQuery(name) {
  const re = new RegExp(escapeRegExp(name), "i");
  return { tag: { $in: [re] }, site: "hanime", ...queryFirt };
}

async function getTagMaxPage(name) {
  const total = await Jav.countDocuments(buildGenreTagQuery(name));
  const dbMaxPage = Math.max(1, Math.ceil(total / LIMIT));
  return TAG_MAX_PAGE_LIMIT ? Math.min(TAG_MAX_PAGE_LIMIT, dbMaxPage) : dbMaxPage;
}

async function buildGenreTagPage(name, page) {
  const locals = makeBaseLocals();
  const result = await Jav.paginate(buildGenreTagQuery(name), {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select: SELECT,
    lean: true,
    leanWithId: false,
  });

  if (!result.docs.length) return;

  result.name = name;
  result.site = "hanime";
  locals.curSite = "hanime";

  const mockReq = makeMockReq({ locals, type: "tag", name, page, site: "hanime" });
  locals.meta = buildListMeta({
    req: mockReq,
    type: "tag",
    name,
    page,
    totalPages: result.totalPages,
    siteName: SITE_NAME,
  });

  locals.meta = {
    ...locals.meta,
    titlePage: `${name}視頻合集`,
    descPage: `這裡整理了與「${name}」相關的 hanime 動漫內容，方便快速查找感興趣的動畫作品。`,
  };

  Object.assign(result, {
    ...withPageRange(result, {
      prelink: `/tag/${encodeURIComponent(name)}/pageTpl?site=hanime`,
    }),
  });

  const html = await renderTemplate("boot", result, locals);
  const file = pageCache.makeTagHtmlPath({
    lang: "tw",
    type: "tag",
    name,
    page,
    site: "hanime",
  });

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
  console.log(`[genre-tag] ${name}?site=hanime page=${page}`);
}

async function getBuildGenreTagItems() {
  const map = new Map();
  for (const item of genreNav) {
    const name = getNameFromNavItem(item);
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name });
  }
  return [...map.values()];
}

async function buildGenreTags() {
  const tags = await getBuildGenreTagItems();
  console.log(`[genre-tag] items=${tags.length}`);

  for (const { name } of tags) {
    const maxPage = await getTagMaxPage(name);
    console.log(`[genre-tag] ${name}?site=hanime maxPage=${maxPage}`);

    const jobs = [];
    for (let page = 1; page <= maxPage; page++) jobs.push({ name, page });
    await runPool(jobs, ({ name, page }) => buildGenreTagPage(name, page));
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    process.env.MONGO_URI = "mongodb://127.0.0.1:27017/downM3u8";
  }

  console.log(`[cache] OUT_DIR=${pageCache.OUT_DIR}`);
  console.log(`[cache] CONCURRENCY=${CONCURRENCY}`);
  console.log(`[cache] GENRE_MAX_PAGE=${GENRE_MAX_PAGE_LIMIT || "auto"}`);
  console.log(`[cache] TAG_MAX_PAGE=${TAG_MAX_PAGE_LIMIT || "auto"}`);
  console.log(`[cache] SITE_URL=${SITE_URL}`);
  console.log("[cache] only build anime pages, no multilingual");

  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });

  await buildGenre();
  await buildGenreTags();

  await mongoose.disconnect();
  console.log("Anime page cache built.");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
