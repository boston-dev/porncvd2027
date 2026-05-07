// scripts/warm-page-cache.js
"use strict";

const dotenv= require("dotenv"); 

// 根据环境自动加载
dotenv.config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
})

// 再加载通用
dotenv.config()

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs/promises");
const ejs = require("ejs");
const OpenCC = require("opencc-js");

const Jav = require("../models/Jav");
const gNav = require("../nav.json");
const genreNav = require("../genreNav.json");
const { buildListMeta } = require("../utils/buildMeta");
const { withPageRange } = require("../middleware/rateLimit");
const pageCache = require("../utils/pageCache");

const toCN = OpenCC.Converter({ from: "twp", to: "cn" });

const LIMIT = Number(process.env.PAGE_LIMIT || 40);
const CONCURRENCY = Number(process.env.CONCURRENCY || 80);
const TAG_LIMIT = Number(process.env.TAG_LIMIT || 1000);
const TAG_MIN_COUNT = Number(process.env.TAG_MIN_COUNT || 500);

const HOME_MAX_PAGE_LIMIT = process.env.HOME_MAX_PAGE
  ? Number(process.env.HOME_MAX_PAGE)
  : null;

const TAG_MAX_PAGE_LIMIT = process.env.TAG_MAX_PAGE
  ? Number(process.env.TAG_MAX_PAGE)
  : null;

const CACHE_LANGS = String(process.env.CACHE_LANGS || "tw,cn")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const SITE_NAME = process.env.SITE_NAME || "porncvd";
const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:4350").replace(
  /\/+$/,
  ""
);

const queryFirt = { disable: { $ne: 1 } };
const queryHome= { site: { $nin: process.env.siteArr }, ...queryFirt };
const SELECT =
  "title title_en img url site tag cat date id path vipView source site";

const tagNav = require("../nav.json")
  .filter((v) => v.href.includes("/cat"))
  .map((v) => ({
    ...v,
    p: v.href.replace("/cat/", "").toLowerCase(),
  }));

function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function t(text, typeSite) {
  if (!text || typeSite === "hanime") return text;
  return toCN(String(text));
}

function makeBaseLocals(lang) {
  const isCN = lang === "cn";

  return {
    IndexSite: SITE_URL,
    isCN,
    basePath: isCN ? "/zh-CN" : "",
    isMobile: false,
    siteArr: ["hanime"],
    gNav,
    genreNav,
    isProd: process.env.NODE_ENV === "production",
    frends: [],
    curSite: "",
    tplLang: "",
    orders_id: "",
    t: (text, typeSite) => {
      if (!text || typeSite === "hanime") return text;
      const str = String(text);
      return isCN ? toCN(str) : str;
    },
    meta: {
      title:
        "porncvd - 素人av/免費A片/流出/性愛自拍/素人/成人無碼/免費成人/台灣自拍",
      keywords:
        "上萬免費在線A片，最新番號中文字幕、無碼流出、Hentai、色情動漫、JAV、國產自拍、做愛av、素人av、免費A片、流出、性愛自拍、素人、成人無碼、免費成人、台灣自拍，出處你懂的",
      desc:
        "上萬免費在線A片，最新番號中文字幕、無碼流出、Hentai、色情動漫、JAV、國產自拍、做愛av、素人av、免費A片、流出、性愛自拍、素人、成人無碼、免費成人、台灣自拍，出處你懂的",
      title_zh:
        "porncvd - 素人av/免费A片/流出/性爱自拍/素人/成人无码/免费成人/台湾自拍",
      keywords_zh:
        "上万免费在线A片，最新番号中文字幕、无码流出、Hentai、色情动漫、JAV、国产自拍、做爱av、素人av、免费A片、流出、性爱自拍、素人、成人无码、免费成人、台湾自拍，出处你懂的",
      desc_zh:
        "上万免费在线A片，最新番号中文字幕、无码流出、Hentai、色情动漫、JAV、国产自拍、做爱av、素人av、免费A片、流出、性爱自拍、素人、成人无码、免费成人、台湾自拍，出处你懂的",
      title_en:
        "porncvd-Amateur AV/Free Porn/Outflow/Sex Selfie/Amateur/Uncensored Adult/Free Adult/Taiwan Selfie",
      keywords_en:
        "Tens of thousands of free online porn videos, the latest Chinese subtitles, uncensored streaming, Hentai, porn anime, JAV, domestic selfies, sex av, amateur av, free porn, streaming, sex selfies, amateur, adult uncensored, free adult, Taiwan Selfie, you know the source",
      desc_en:
        "Tens of thousands of free online porn videos, the latest Chinese subtitles, uncensored streaming, Hentai, porn anime, JAV, domestic selfies, sex av, amateur av, free porn, streaming, sex selfies, amateur, adult uncensored, free adult, Taiwan Selfie, you know the source",
    },
  };
}

function makeMockReq({ locals, type, name, page }) {
  const site = new URL(SITE_URL);
  const proto = site.protocol.replace(":", "") || "https";

  const urlPath = `${locals.basePath}/${type}/${encodeURIComponent(
    name
  )}/${page}`.replace(/\/{2,}/g, "/");

  return {
    protocol: proto,
    hostname: site.hostname,
    host: site.host,
    path: urlPath,
    url: urlPath,
    originalUrl: urlPath,
    baseUrl: locals.basePath || "",
    query: {},
    params: {
      name,
      p: String(page),
    },
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
      const current = items[index++];
      await worker(current);
    }
  });

  await Promise.all(workers);
}

async function getHomeMaxPage() {
  const total = await Jav.countDocuments(queryHome);
  const dbMaxPage = Math.max(1, Math.ceil(total / LIMIT));
  return HOME_MAX_PAGE_LIMIT
    ? Math.min(HOME_MAX_PAGE_LIMIT, dbMaxPage)
    : dbMaxPage;
}

async function buildHomePage(page, lang) {
  const locals = makeBaseLocals(lang);
  const query = { site: { $nin: locals.siteArr }, ...queryFirt };

  const result = await Jav.paginate(query, {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select: SELECT,
    lean: true,
    leanWithId: false,
  });

  if (!result.docs.length) return;

  Object.assign(result, {
    ...withPageRange(result, { prelink: "/?page=pageTpl" }),
    userVideo: { docs: [], title: "現正熱播中" },
  });

  if (locals.isCN) {
    result.docs = result.docs.map((video) => {
      if (video.site === "hanime") return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });
  }

  locals.meta.canonical = SITE_URL;

  const html = await renderTemplate("index", result, locals);
  const file = pageCache.makeHomeHtmlPath({ lang, page });

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");

  console.log(`[home] ${lang} page=${page}`);
}

async function buildHome() {
  const maxPage = await getHomeMaxPage();

  console.log(`[home] maxPage=${maxPage}`);
  const jobs = [];

  for (const lang of CACHE_LANGS) {
    for (let page = 1; page <= maxPage; page++) {
      jobs.push({ page, lang });
    }
  }

  await runPool(jobs, ({ page, lang }) => buildHomePage(page, lang));
}

async function getTopTags() {
  const rows = await Jav.aggregate([
    {
      $match: {
        disable: { $ne: 1 },
        tag: { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        tags: {
          $cond: [{ $isArray: "$tag" }, "$tag", ["$tag"]],
        },
      },
    },
    { $unwind: "$tags" },
    {
      $match: {
        tags: { $type: "string", $ne: "" },
      },
    },
    {
      $group: {
        _id: "$tags",
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gte: TAG_MIN_COUNT },
      },
    },
    {
      $sort: {
        count: -1,
      },
    },
    {
      $limit: TAG_LIMIT,
    },
  ]).allowDiskUse(true);

  return rows.map((v) => v._id);
}

function normalizeTagName(rawName) {
  let name = String(rawName || "").trim().toLowerCase();

  const findWord = tagNav.find((v) => v.p === name);

  if (findWord) {
    name = findWord.text;
  }

  return name;
}

function buildTagQuery(name, site = "") {
  let keywords = [name];

  if (name.includes("台灣")) keywords.push("台灣");
  if (name.includes("twzp")) keywords.push("TWZP");
  if (name.includes("custom udon")) keywords.push("Custom Udon");

  keywords = [...new Set(keywords)];

  const optRegexp = keywords
    .filter(Boolean)
    .map((k) => new RegExp(escapeRegExp(k.trim()), "i"));

  let query = optRegexp.length
    ? { tag: { $in: optRegexp }, ...queryFirt }
    : { ...queryFirt };

  if (site) {
    query.site = site;
  }

  if (name === "porn5f") {
    query = { site: "5f", ...queryFirt };
  }

  return query;
}

async function getTagMaxPage(name) {
  const total = await Jav.countDocuments(buildTagQuery(name));
  const dbMaxPage = Math.max(1, Math.ceil(total / LIMIT));

  return TAG_MAX_PAGE_LIMIT
    ? Math.min(TAG_MAX_PAGE_LIMIT, dbMaxPage)
    : dbMaxPage;
}

async function buildTagPage(name, page, lang, type = "tag") {
  const locals = makeBaseLocals(lang);
  const query = buildTagQuery(name);

  const result = await Jav.paginate(query, {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select: SELECT,
    lean: true,
    leanWithId: false,
  });

  if (!result.docs.length) return;

  result.name = name;

  const mockReq = makeMockReq({
    locals,
    type,
    name,
    page,
  });

  locals.meta = buildListMeta({
    req: mockReq,
    type,
    name,
    page,
    totalPages: result.totalPages,
    siteName: SITE_NAME,
  });

  locals.meta = {
    ...locals.meta,
    titlePage: `${name}视频合集`,
    descPage: `
      这里整理了与「${name}」相关的精选视频资源，内容更新及时，分类清晰，
      方便用户快速查找感兴趣的相关作品。
    `,
  };

  Object.assign(result, {
    ...withPageRange(result, {
      prelink: `/${type}/${encodeURIComponent(name)}/pageTpl`,
    }),
  });

  if (locals.isCN) {
    result.docs = result.docs.map((video) => {
      if (video.site === "hanime") return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });

    locals.meta = {
      ...locals.meta,
      title: t(locals.meta.title),
      keywords: t(locals.meta.title),
      desc: t(locals.meta.desc),
      titlePage: t(locals.meta.titlePage),
      descPage: t(locals.meta.descPage),
    };
  }

  const html = await renderTemplate("boot", result, locals);

  const file = pageCache.makeTagHtmlPath({
    lang,
    type,
    name,
    page,
    site: "",
  });

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");

  console.log(`[${type}] ${lang} ${name} page=${page}`);
}

async function buildTag() {
  const tags = (await getTopTags()).map(normalizeTagName).filter(Boolean);
  console.log(tags)
  console.log(`[tag] total=${tags.length}`);
    return
  for (const name of tags) {
    const maxPage = await getTagMaxPage(name);

    console.log(`[tag] ${name} maxPage=${maxPage}`);

    const jobs = [];

    for (const lang of CACHE_LANGS) {
      for (let page = 1; page <= maxPage; page++) {
        jobs.push({ name, page, lang });
      }
    }

    await runPool(jobs, ({ name, page, lang }) =>
      buildTagPage(name, page, lang, "tag")
    );
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    process.env.MONGO_URI = "mongodb://127.0.0.1:27017/downM3u8";
  }

  console.log(`[cache] OUT_DIR=${pageCache.OUT_DIR}`);
  console.log(`[cache] CONCURRENCY=${CONCURRENCY}`);
  console.log(`[cache] CACHE_LANGS=${CACHE_LANGS.join(",")}`);
  console.log(`[cache] HOME_MAX_PAGE=${HOME_MAX_PAGE_LIMIT || "auto"}`);
  console.log(`[cache] TAG_MAX_PAGE=${TAG_MAX_PAGE_LIMIT || "auto"}`);
  console.log(`[cache] TAG_LIMIT=${TAG_LIMIT}`);
  console.log(`[cache] TAG_MIN_COUNT=${TAG_MIN_COUNT}`);
  console.log(`[cache] SITE_URL=${SITE_URL}`);

  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  });

  //await buildHome();
  await buildTag();

  await mongoose.disconnect();

  console.log("All page cache built.");
}

main().catch(async (err) => {
  console.error(err);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});