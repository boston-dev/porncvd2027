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

router.get('/sitemap.xml', seo.sitemapIndex);           // 让它变成 index
router.get('/sitemap-javs-:shard.xml.gz', seo.sitemapJavsShard);
router.get('/sitemap-tag.xml.gz', seo.sitemapTag);
router.get('/sitemap-cat.xml.gz', seo.sitemapCat);
router.get('/robots.txt', seo.robots);                 // 你现在写 /robots.txt 更标准

module.exports = router;
