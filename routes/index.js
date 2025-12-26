'use strict';
const router = require('express').Router();
const javs = require('../controllers/javs.controller');
const seo = require('../controllers/seo.controller');

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

// sitemap index：支持 xml / xml.gz
router.get(['/sitemap.xml', '/sitemap.xml.gz'], seo.sitemapIndex);

// jav shards：支持 xml / xml.gz（强烈建议加正则，只允许数字）
router.get(
  ['/sitemap-javs-:shard(\\d+)\\.xml', '/sitemap-javs-:shard(\\d+)\\.xml\\.gz'],
  seo.sitemapJavsShard
);

// tag/cat：支持 xml / xml.gz
router.get(['/sitemap-tag.xml', '/sitemap-tag.xml.gz'], seo.sitemapTag);
router.get(['/sitemap-cat.xml', '/sitemap-cat.xml.gz'], seo.sitemapCat);

module.exports = router;
