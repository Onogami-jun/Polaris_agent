/**
 * Polaris Email Service — SMTP via bitwool@163.com
 *
 * 使用 nodemailer 直连 163 邮箱 SMTP 发送邮件。
 * 发件人固定为 bitwool@163.com，用户只需在设置中填写 SMTP 授权码。
 *
 * 163 授权码获取：
 *   登录 mail.163.com → 设置 → POP3/SMTP/IMAP → 开启 SMTP → 生成授权码
 */

const nodemailer = require('nodemailer');

const SMTP_AUTH = {
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  auth: {
    user: 'bitwool@163.com',
    pass: 'GFRf3LStAUwM7GGC',
  },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
};

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport(SMTP_AUTH);
  return _transporter;
}

/**
 * 发送 6 位验证码邮件
 */
async function sendVerificationCode(toEmail, code) {
  const transporter = getTransporter();
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:bold">✦</div>
    <h1 style="margin:16px 0 4px;font-size:22px;color:#1a1a1a">BitWool 验证码</h1>
    <p style="color:#666;margin:0">欢迎注册 Polaris · 运筹优化科研助手</p>
  </div>
  <div style="text-align:center;font-size:36px;font-weight:bold;letter-spacing:12px;color:#6366f1;padding:20px;background:#f5f3ff;border-radius:12px;margin-bottom:24px">
    ${code}
  </div>
  <p style="color:#999;font-size:13px;text-align:center">验证码 10 分钟内有效。如非本人操作，请忽略此邮件。</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#ccc;font-size:11px;text-align:center">BitWool Studio · bitwool.cn</p>
</body>
</html>`;

  const info = await transporter.sendMail({
    from: '"BitWool Studio" <bitwool@163.com>',
    to: toEmail,
    subject: 'BitWool 验证码: ' + code,
    html,
  });
  return { success: true, messageId: info.messageId };
}

/**
 * 发送注册成功欢迎邮件
 */
async function sendWelcomeEmail(toEmail, displayName) {
  const transporter = getTransporter();
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:bold">✦</div>
    <h1 style="margin:16px 0 4px;font-size:22px;color:#1a1a1a">欢迎加入 BitWool</h1>
    <p style="color:#666;margin:0">Hi ${displayName}，你的 Polaris 账号已成功注册</p>
  </div>
  <div style="text-align:left;padding:20px;background:#f9fafb;border-radius:12px;margin-bottom:24px;font-size:14px;color:#555;line-height:1.8">
    <p style="margin:0 0 12px">🎉 你现在可以：</p>
    <p style="margin:4px 0">✦ 用自然语言描述并求解优化问题</p>
    <p style="margin:4px 0">✦ 讨论算法设计和方法选择</p>
    <p style="margin:4px 0">✦ 跑批量实验并生成论文表格</p>
    <p style="margin:4px 0">✦ 同一账号登录启文 QiWen Writer</p>
  </div>
  <p style="color:#999;font-size:13px;text-align:center">BitWool 账号在启文和 Polaris 之间互通，一次注册，两端使用。</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#ccc;font-size:11px;text-align:center">BitWool Studio · bitwool.cn</p>
</body>
</html>`;

  const info = await transporter.sendMail({
    from: '"BitWool Studio" <bitwool@163.com>',
    to: toEmail,
    subject: '欢迎加入 BitWool！',
    html,
  });
  return { success: true, messageId: info.messageId };
}

/**
 * 生成 6 位随机验证码
 */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { sendVerificationCode, sendWelcomeEmail, generateCode };
