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
  res.locals.gNav=gNav
  res.locals.frends=[]
    res.locals.curSite=''
   res.locals.tplLang=''
   res.locals.orders_id=''
   res.locals.genreNav=genreNav
 res.locals.meta={
        "title": "91吃瓜 全网更新最快最全的吃瓜网！",
        "keywords": "91吃瓜,91吃瓜网,91吃瓜,51,吃瓜,吃瓜网,朝阳群众吃瓜网,黑料,黑料不打烊,瓜报,一起吃瓜网,黑料吃瓜网,热门大瓜,明星资讯,网红黑料,内涵段子,今日吃瓜,",
        "desc": "91吃瓜是全网更新最快最全的吃瓜网!",
        "title_zh": "porncvd - 素人av/免费A片/流出/性爱自拍/素人/成人无码/免费成人/台湾自拍",
        "keywords_zh": "上万免费在线A片，最新番号中文字幕、无码流出、Hentai、色情动漫、JAV、国产自拍、做爱av、素人av、免费A片、流出、性爱自拍、素人、成人无码、免费成人、台湾自拍，出处你懂的",
        "desc_zh": "上万免费在线A片，最新番号中文字幕、无码流出、Hentai、色情动漫、JAV、国产自拍、做爱av、素人av、免费A片、流出、性爱自拍、素人、成人无码、免费成人、台湾自拍，出处你懂的",
        "title_en":'porncvd-Amateur AV/Free Porn/Outflow/Sex Selfie/Amateur/Uncensored Adult/Free Adult/Taiwan Selfie',
        "keywords_en": 'Tens of thousands of free online porn videos, the latest Chinese subtitles, uncensored streaming, Hentai, porn anime, JAV, domestic selfies, sex av, amateur av, free porn, streaming, sex selfies, amateur, adult uncensored, free adult, Taiwan Selfie, you know the source',
        "desc_en": 'Tens of thousands of free online porn videos, the latest Chinese subtitles, uncensored streaming, Hentai, porn anime, JAV, domestic selfies, sex av, amateur av, free porn, streaming, sex selfies, amateur, adult uncensored, free adult, Taiwan Selfie, you know the source',
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
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cgc';
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
