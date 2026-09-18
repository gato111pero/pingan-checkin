import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { normalizeEmails } from '@/lib/emails';

export const dynamic = 'force-dynamic';

/** 修改昵称 / 联系人邮箱。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);

    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    await ensureTable();
    const db = requireSql();

    const rows = await db`SELECT id FROM users WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    await db`
      UPDATE users SET name = ${name}, emails = ${JSON.stringify(emails)} WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true, id, name, emails });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
