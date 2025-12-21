'use strict';
const router = require('express').Router();

const javs = require('../controllers/javs.controller');
const seo = require('../controllers/seo.controller');

router.get('/', javs.home);
router.get('/search/:search_query?/:p?', javs.search);
router.get('/tag/:name/:p?', javs.tag);
router.get('/cat/:name/:p?', javs.tag);
router.get('/genre/:p?', javs.genre);
// Detail routes (with validation inside controller)
router.get('/javs/:id.html', javs.detail);

router.post('/users/resource', javs.resourcePost);
router.post('/thumbzilla/checkData', javs.resourceFind);
router.post('/users/isHave', javs.resourceFind);

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
