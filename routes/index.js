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

router.get('/sitemap.xml', seo.sitemap);
router.get('/robots.txt', seo.robots);

module.exports = router;
