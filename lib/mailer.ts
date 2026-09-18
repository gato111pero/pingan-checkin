import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error('SMTP 未配置：请设置 SMTP_HOST / SMTP_USER / SMTP_PASS 环境变量');
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
  }
  return transporter;
}

interface MailParams {
  to: string[];
  name?: string;
  lastCheckin?: Date | null;
}

function buildBody({ name, lastCheckin }: { name?: string; lastCheckin?: Date | null }) {
  const display = name ? `「${name}」` : '您关注的人';
  const lastText = lastCheckin
    ? `上次签到时间：${lastCheckin.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`
    : '对方在设置后尚未完成过签到';

  const text = [
    '您好，',
    '',
    '这是一封由「平安签到」自动发送的预警邮件。',
    '',
    `${display} 已连续两天（48 小时）未完成每日签到，可能遇到了意外情况。`,
    '',
    lastText,
    '',
    '请尽快通过电话或其他方式联系确认其安全。',
    '',
    '—— 平安签到（系统自动发送，请勿直接回复）',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
      <h2 style="margin:0 0 16px;color:#b91c1c;">⚠️ 平安签到 · 紧急预警</h2>
      <p style="line-height:1.7;">您好，</p>
      <p style="line-height:1.7;">
        这是一封由「平安签到」自动发送的预警邮件：<br/>
        <strong>${escapeHtml(display)}</strong> 已连续两天（48 小时）未完成每日签到，可能遇到了意外情况。
      </p>
      <p style="line-height:1.7;color:#6b7280;font-size:14px;">${escapeHtml(lastText)}</p>
      <p style="line-height:1.7;">请尽快通过电话或其他方式联系确认其安全。</p>
      <p style="margin-top:24px;color:#9ca3af;font-size:13px;">—— 平安签到（系统自动发送，请勿直接回复）</p>
    </div>
  `;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 发送「连续两天未签到」预警邮件。 */
export async function sendAlertEmail({ to, name, lastCheckin }: MailParams): Promise<void> {
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const display = name ? `「${name}」` : '您关注的人';
  const { text, html } = buildBody({ name, lastCheckin });

  await getTransporter().sendMail({
    from: `平安签到 <${from}>`,
    to: to.join(', '),
    subject: `⚠️【平安签到】预警：${display}已连续两天未签到`,
    text,
    html,
  });
}

/** 发送一封测试邮件，用于验证 SMTP 配置是否正确。 */
export async function sendTestEmail(to: string): Promise<void> {
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  await getTransporter().sendMail({
    from: `平安签到 <${from}>`,
    to,
    subject: '✅【平安签到】测试邮件',
    text: [
      '您好，',
      '',
      '这是一封来自「平安签到」的测试邮件，说明邮件发送功能已配置成功。',
      '',
      '—— 平安签到（系统自动发送，请勿直接回复）',
    ].join('\n'),
    html: `<div style="font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:24px;color:#1f2937;">
      <h2 style="margin:0 0 16px;color:#059669;">✅ 平安签到 · 测试邮件</h2>
      <p style="line-height:1.7;">这是一封来自「平安签到」的测试邮件，说明邮件发送功能已配置成功。</p>
      <p style="margin-top:24px;color:#9ca3af;font-size:13px;">—— 平安签到（系统自动发送，请勿直接回复）</p>
    </div>`,
  });
}
