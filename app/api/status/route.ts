import { NextResponse } from 'next/server';
import { ensureTable, requireSql, ALERT_AFTER_HOURS } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 查询用户状态：上次签到、剩余安全时间、联系人等。 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  }

  try {
    await ensureTable();
    const db = requireSql();
    const rows = await db`SELECT * FROM users WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    const u = rows[0] as Record<string, unknown>;
    const lastCheckin = u.last_checkin ? new Date(u.last_checkin as string) : null;
    const createdAt = new Date(u.created_at as string);
    const baseline = lastCheckin ?? createdAt;
    const safeUntil = new Date(baseline.getTime() + ALERT_AFTER_HOURS * 3600_000);
    const hoursLeft = Math.max(0, (safeUntil.getTime() - Date.now()) / 3600_000);

    return NextResponse.json({
      id: u.id,
      name: u.name,
      emails: JSON.parse(String(u.emails || '[]')),
      lastCheckin: lastCheckin ? lastCheckin.toISOString() : null,
      createdAt: createdAt.toISOString(),
      alerted: Boolean(u.alerted),
      safeUntil: safeUntil.toISOString(),
      hoursLeft,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
