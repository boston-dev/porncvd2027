# PornCVD 稳定性增强后端模板（Express + Mongoose）

这份模板的目标：**抗爬、抗乱参、抗崩溃、避免 PM2 无限重启**。
> 视图模板（EJS）请继续沿用你线上 porncvd.com 的结构，本模板只强化后端稳定性。

## 关键增强
- 详情页 `/hanime/:id.html`：**ObjectId 正则校验**（24位hex）→ 非法直接 404，不进数据库
- 全局错误兜底：任何异常都不会泄露堆栈，并避免未处理导致重启
- Mongo 连接：失败 **指数退避重试**（不 crash-loop）
- 限速：全站 baseline + 详情页更严格
- 日志：带 request-id，方便定位哪条路由触发问题
- 安全：helmet + body 限制 + 静态缓存

## 你需要的环境变量
- PORT=4350
- HOST=0.0.0.0   （可不填）
- NODE_ENV=production
- MONGO_URI=mongodb://127.0.0.1:27017/你的库
- SITE_URL=https://porncvd.com   （推荐，sitemap/canonical更准）

## 安装依赖
npm i express mongoose ejs helmet compression morgan express-rate-limit

## 启动（PM2 推荐）
pm2 start app.js --name porncvd
pm2 save

## Nginx 建议
在 Nginx 对 `/hanime/` 做 limit_req，配合本模板更抗刷。


## 统一 404 / 报错页面
- 所有 404 与 500 都会渲染同一个视图 `boot`，并随机展示 16 条视频。
- 逻辑在 `utils/renderFallback.js` 和 `middleware/errors.js`。


## v3 说明
- 静态资源与 API 的 404/500 将直接返回文本状态，不渲染 boot 页面。
- 只有页面路由的 404/500 才会统一渲染 boot 并随机 16 条。
