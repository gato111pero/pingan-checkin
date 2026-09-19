import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { normalizeEmails } from '@/lib/emails';
import { getUserByToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 修改昵称 / 联系人邮箱（需登录）。 */
export async function POST(req: Request) {
  try {
    const user = await getUserByToken(req);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);

    await ensureTable();
    const db = requireSql();

    await db`
      UPDATE users SET name = ${name}, emails = ${JSON.stringify(emails)} WHERE id = ${user.id as string}
    `;

    return NextResponse.json({ ok: true, id: user.id, name, emails });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
