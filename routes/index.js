'use strict';
const router = require('express').Router();
const javs = require('../controllers/javs.controller');
const seo = require('../controllers/seo.controller');

const path = require("path");
const fs = require("fs");

const PLACEHOLDER_FILE = path.join(process.cwd(), "public", "placeholder.mp4");

router.get("/placeholder/:id.mp4", (req, res) => {
  // 只允许简单 id，避免奇怪路径（安全）
  const id = String(req.params.id || "");
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return res.status(404).end();
  }

  // 文件不存在直接 404
  if (!fs.existsSync(PLACEHOLDER_FILE)) {
    return res.status(404).send("placeholder missing");
  }

  // 强缓存（可按需调）
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  // 支持 Range（很多播放器/爬虫会用）
  const stat = fs.statSync(PLACEHOLDER_FILE);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).end();
      return;
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).end();
      return;
    }

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", end - start + 1);

    fs.createReadStream(PLACEHOLDER_FILE, { start, end }).pipe(res);
  } else {
    res.setHeader("Content-Length", fileSize);
    fs.createReadStream(PLACEHOLDER_FILE).pipe(res);
  }
});

router.get('/', javs.home);
router.get('/search/:search_query?/:p?', javs.search);
router.get('/tag/:name/:p?', javs.tag);
router.get('/cat/:name/:p?', javs.tag);
router.get('/javs/:id.html', javs.detail);
router.get('/hot.html', javs.detail);
router.get('/genre/:p?', javs.genre);
router.get('/hot/:p?', javs.hot);
// ===== 简体入口（新增）=====
//router.get('/zh-CN', javs.home);
router.get('/zh-CN', javs.home);
router.get('/zh-CN/search/:search_query?/:p?', javs.search);
router.get('/zh-CN/tag/:name/:p?', javs.tag);
router.get('/zh-CN/cat/:name/:p?', javs.tag);
router.get('/zh-CN/javs/:id.html', javs.detail);
router.get('/zh-CN/hot/:p?', javs.hot);
router.get('/zh-CN/genre/:p?', (req, res) => {
  const p = req.params.p ? `/${req.params.p}` : '';
  // 保留 ?xxx=yyy
  const qs = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';
  return res.redirect(301, `/genre${p}${qs}`);
});

router.post('/users/resource', javs.resourcePost);//chatgpt
router.post('/thumbzilla/checkData', javs.resourceFind);
router.post('/users/isHave', javs.resourceFind);
router.post('/users/chatsHost', javs.chatsHost);
router.get('/dmca.html', (req, res) => {
  return res.render('dmca');
});
// robots
router.get('/robots.txt', seo.robots);
router.get(['/sitemap.xml', '/sitemap.xml.gz'], seo.sitemapIndex);
router.get(['/sitemap-javs.xml', '/sitemap-javs.xml.gz'], seo.sitemapJavsMix);
router.get(['/sitemap-tag.xml', '/sitemap-tag.xml.gz'], seo.sitemapTagTop);
router.get(['/sitemap-cat.xml', '/sitemap-cat.xml.gz'], seo.sitemapCat);

module.exports = router;
