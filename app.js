'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoose = require('mongoose');
const gNav = require('./nav.json');
const genreNav = require('./genreNav.json');
const routes = require('./routes');
const { requestId, requestLogger } = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errors');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();

/** Trust proxy if behind Nginx/Cloudflare (recommended for correct req.ip / req.protocol) */
app.set('trust proxy', 1);

/** Views */
// 设置模板引擎
app.set('view engine', 'html');
//设置一下对于html格式的文件，渲染的时候委托ejs的渲染方面来进行渲染
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'views'));

/** Security & performance */
app.disable('x-powered-by');
app.use(helmet({
  // Adult/video sites often need inline scripts/styles; keep CSP off unless you can tune it.
  contentSecurityPolicy: false,
}));
app.use(compression());

/** Body limits (avoid abuse) */
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

/** Request tracing + logs */
app.use(requestId());
app.use(morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms rid=:req[x-request-id] ip=:req[x-forwarded-for]'));
app.use(requestLogger());

/** Rate limit (global baseline) */
app.use(generalLimiter);
/** Static (7d cache) */
app.use(express.static(path.join(__dirname, 'public')));
app.use( async (req,res,next) => {
   res.locals.siteName = 'PicGaze'; 
   res.locals.currentPath = req.path; 
  res.locals.gNav=gNav
  res.locals.frends=[]
    res.locals.curSite=''
   res.locals.tplLang=''
   res.locals.orders_id=''
   res.locals.genreNav=genreNav
    res.locals.meta={
            "title": "PicGaze – Free Model Gallery, Cosplay Photos & OnlyFans Leaks",
            "keywords": "model photos, cosplay gallery, onlyfans leaks, instagram models, tiktok girls, nsfw images, bikini models, hd pictures, picgaze",
            "desc": "PicGaze is a free high-quality gallery of models, cosplay sets, Instagram and TikTok girls, updated daily. Browse HD photos, curated collections and trending OnlyFans leaks in a clean, mobile-friendly experience.",
        }
   next();
})
/** Routes */
app.use('/', routes);

/** 404 + error */
app.use(notFound);
app.use(errorHandler);

/** --- Mongo connect with backoff (avoid infinite crash-loop) --- */
async function connectMongoWithRetry() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/picsezo';
  const opts = {
    autoIndex: false,
    serverSelectionTimeoutMS: 8000,
  };

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      await mongoose.connect(uri, opts);
      console.log(`[mongo] connected (attempt ${attempt})`);
      break;
    } catch (err) {
      const wait = Math.min(30000, 1000 * Math.pow(2, attempt)); // 1s,2s,4s,... max 30s
      console.error(`[mongo] connect failed (attempt ${attempt}): ${err.message}. retry in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  mongoose.connection.on('disconnected', () => console.error('[mongo] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[mongo] reconnected'));
}

/** --- Hardening: never let unhandled errors crash silently --- */
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Allow PM2 to restart if truly fatal, but delay to flush logs
  setTimeout(() => process.exit(1), 300);
});

/** Graceful shutdown */
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received`);
  Promise.resolve()
    .then(() => mongoose.connection.close(false))
    .catch(() => {})
    .finally(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/** Start server */
async function start() {
  await connectMongoWithRetry();
  const port = Number(process.env.PORT || 4350);
  const host ='127.0.0.1' //0.0.0.0 'localhost';
  app.listen(port, host, () => {
    console.log(`[server] listening on http://${host}:${port} env=${process.env.NODE_ENV || 'development'}`);
  });
}

start();

module.exports = app;
