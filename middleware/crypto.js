const crypto = require("crypto");

const SECRET = "69ec6a0b-45c4-8399-a000-b4d2515bae90";

exports.signOnlineToken = ({ vid, ip, ua }) => {
  const ts = Date.now();
  const raw = `${vid}|${ip}|${ua}|${ts}`;

  const sign = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");

  return Buffer.from(JSON.stringify({ vid, ts, sign })).toString("base64url");
};

exports.verifyOnlineToken = ({ token, vid, ip, ua }) => {
  try {
    const data = JSON.parse(Buffer.from(token, "base64url").toString());

    if (data.vid !== vid) return false;

    // token 5分钟有效
    if (Date.now() - data.ts > 5 * 60 * 1000) return false;

    const raw = `${data.vid}|${ip}|${ua}|${data.ts}`;

    const rightSign = crypto
      .createHmac("sha256", SECRET)
      .update(raw)
      .digest("hex");

    return rightSign === data.sign;
  } catch (e) {
    return false;
  }
};

exports.verifyOnlineToken = ({ token, vid, ip, ua }) => {
  try {
    const data = JSON.parse(Buffer.from(token, "base64url").toString());

    if (data.vid !== vid) return false;

    // token 5分钟有效
    if (Date.now() - data.ts > 5 * 60 * 1000) return false;

    const raw = `${data.vid}|${ip}|${ua}|${data.ts}`;

    const rightSign = crypto
      .createHmac("sha256", SECRET)
      .update(raw)
      .digest("hex");

    return rightSign === data.sign;
  } catch (e) {
    return false;
  }
};
exports.getSiteUrl = (req) => {
  const fixed = process.env.SITE_URL;
  if (fixed) return fixed.replace(/\/+$/, "");

  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  return `${proto}://${host}`.replace(/\/+$/, "");
};
