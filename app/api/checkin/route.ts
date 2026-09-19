import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { getUserByToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 每日签到：更新 last_checkin，并重置预警标记（需登录）。 */
export async function POST(req: Request) {
  try {
    const user = await getUserByToken(req);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    await ensureTable();
    const db = requireSql();

    const updated = await db`
      UPDATE users
      SET last_checkin = now(), alerted = false, alert_sent_at = NULL
      WHERE id = ${user.id as string}
      RETURNING last_checkin
    `;

    const lastCheckin = updated[0]?.last_checkin
      ? new Date(updated[0].last_checkin as string).toISOString()
      : null;

    return NextResponse.json({ ok: true, lastCheckin });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
