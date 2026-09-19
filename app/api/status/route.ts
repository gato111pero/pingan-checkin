import { NextResponse } from 'next/server';
import { ensureTable, ALERT_AFTER_HOURS } from '@/lib/db';
import { getUserByToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 查询当前登录用户的状态（需登录）。 */
export async function GET(req: Request) {
  try {
    await ensureTable();
    const user = await getUserByToken(req);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const lastCheckin = user.last_checkin ? new Date(user.last_checkin as string) : null;
    const createdAt = new Date(user.created_at as string);
    const baseline = lastCheckin ?? createdAt;
    const safeUntil = new Date(baseline.getTime() + ALERT_AFTER_HOURS * 3600_000);
    const hoursLeft = Math.max(0, (safeUntil.getTime() - Date.now()) / 3600_000);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emails: JSON.parse(String(user.emails || '[]')),
      lastCheckin: lastCheckin ? lastCheckin.toISOString() : null,
      createdAt: createdAt.toISOString(),
      alerted: Boolean(user.alerted),
      safeUntil: safeUntil.toISOString(),
      hoursLeft,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
