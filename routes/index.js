'use strict';
const router = require('express').Router();

const javs = require('../controllers/javs.controller');
const seo = require('../controllers/seo.controller');

router.get('/', javs.home);
router.get('/search/:search_query?/:p?', javs.search);
router.get('/tag/:name/:p?', javs.tag);
router.get('/cat/:name/:p?', javs.tag);
router.get('/genre/:p?', javs.genre);
router.get('/hot/:page?.html', javs.hot);
// /models/692129b923e54159ce1c77dd.html
router.get('/girls/:id/:page?', javs.detail);
router.get('/models/:id/:page?.html', javs.models);
router.post('/users/resource', javs.resourcePost);
router.post('/thumbzilla/checkData', javs.resourceFind);
router.post('/users/isHave', javs.resourceFind);

// robots
router.get('/robots.txt', seo.robots);

// sitemap index（两种都给）
router.get('/sitemap.xml', seo.sitemapIndex);
router.get('/sitemap.xml.gz', seo.sitemapIndex);

// javs shard（两种都给，注意正则保证 shard 是数字）
router.get('/sitemap-javs-:shard(\\d+)\\.xml', seo.sitemapJavsShard);
router.get('/sitemap-javs-:shard(\\d+)\\.xml\\.gz', seo.sitemapJavsShard);

// tag/cat（两种都给）
router.get('/sitemap-tag.xml', seo.sitemapTag);
router.get('/sitemap-tag.xml.gz', seo.sitemapTag);

router.get('/sitemap-cat.xml', seo.sitemapCat);
router.get('/sitemap-cat.xml.gz', seo.sitemapCat);


module.exports = router;
