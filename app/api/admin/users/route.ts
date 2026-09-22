import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { getUserByToken, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 管理员：查看所有用户。 */
export async function GET(req: Request) {
  try {
    const user = await getUserByToken(req);
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!isAdmin(user)) return NextResponse.json({ error: '无权限' }, { status: 403 });

    await ensureTable();
    const db = requireSql();
    const rows = await db`
      SELECT id, email, name, emails, last_checkin, created_at, alerted, alert_sent_at
      FROM users ORDER BY created_at DESC
    `;

    const users = rows.map((u: Record<string, unknown>) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      emails: JSON.parse(String(u.emails || '[]')),
      lastCheckin: u.last_checkin ? new Date(u.last_checkin as string).toISOString() : null,
      createdAt: new Date(u.created_at as string).toISOString(),
      alerted: !!u.alerted,
    }));

    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
