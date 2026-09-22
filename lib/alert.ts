import { ensureTable, requireSql, ALERT_AFTER_HOURS } from './db';
import { sendAlertEmail } from './mailer';

export interface AlertResult {
  id: string;
  email: string;
  ok: boolean;
  error?: string;
}

/** 检测连续 48 小时未签到的用户并发送预警邮件，返回执行结果。 */
export async function runAlertCheck(): Promise<{ checked: number; results: AlertResult[] }> {
  await ensureTable();
  const db = requireSql();

  const rows = await db`
    SELECT * FROM users
    WHERE alerted = false
      AND COALESCE(last_checkin, created_at) < now() - (${ALERT_AFTER_HOURS} || ' hours')::interval
  `;

  const results: AlertResult[] = [];
  for (const u of rows as Array<Record<string, unknown>>) {
    const emails = JSON.parse(String(u.emails || '[]')) as string[];
    if (emails.length === 0) continue;
    try {
      await sendAlertEmail({
        to: emails,
        name: u.name ? String(u.name) : undefined,
        lastCheckin: u.last_checkin ? new Date(u.last_checkin as string) : null,
      });
      await db`UPDATE users SET alerted = true, alert_sent_at = now() WHERE id = ${u.id}`;
      results.push({ id: String(u.id), email: String(u.email || ''), ok: true });
    } catch (e) {
      results.push({ id: String(u.id), email: String(u.email || ''), ok: false, error: (e as Error).message });
    }
  }

  return { checked: rows.length, results };
}
