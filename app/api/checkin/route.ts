import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 每日签到：更新 last_checkin，并重置预警标记。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    await ensureTable();
    const db = requireSql();

    const rows = await db`SELECT id FROM users WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    const updated = await db`
      UPDATE users
      SET last_checkin = now(), alerted = false, alert_sent_at = NULL
      WHERE id = ${id}
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
