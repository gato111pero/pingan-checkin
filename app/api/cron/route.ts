import { NextResponse } from 'next/server';
import { ensureTable, requireSql, ALERT_AFTER_HOURS } from '@/lib/db';
import { sendAlertEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/**
 * 定时任务（由 Vercel Cron 每日触发）：
 * 找出「连续两天未签到」且尚未预警的用户，向其联系人发送预警邮件。
 *
 * 鉴权：Vercel 会自动注入 CRON_SECRET 环境变量，并在请求头携带
 * `Authorization: Bearer <CRON_SECRET>`。本地调试如设置了 CRON_SECRET，
 * 需手动在请求头中带上相同的值。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    await ensureTable();
    const db = requireSql();

    // 未签到过则以创建时间作为基线；基线早于「48 小时前」即视为连续两天未签到。
    const rows = await db`
      SELECT * FROM users
      WHERE alerted = false
        AND COALESCE(last_checkin, created_at) < now() - (${ALERT_AFTER_HOURS} || ' hours')::interval
    `;

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const u of rows as Array<Record<string, unknown>>) {
      const emails = JSON.parse(String(u.emails || '[]')) as string[];
      if (emails.length === 0) continue;

      try {
        await sendAlertEmail({
          to: emails,
          name: u.name ? String(u.name) : undefined,
          lastCheckin: u.last_checkin ? new Date(u.last_checkin as string) : null,
        });

        await db`
          UPDATE users SET alerted = true, alert_sent_at = now() WHERE id = ${u.id}
        `;
        results.push({ id: String(u.id), ok: true });
      } catch (e) {
        results.push({ id: String(u.id), ok: false, error: (e as Error).message });
      }
    }

    return NextResponse.json({ checked: rows.length, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
