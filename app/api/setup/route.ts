import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ensureTable, requireSql } from '@/lib/db';
import { normalizeEmails } from '@/lib/emails';

export const dynamic = 'force-dynamic';

/** 创建用户（无需注册）：录入昵称 + 1~3 个联系人邮箱，返回唯一 id。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);
    const id = randomUUID();

    await ensureTable();
    const db = requireSql();
    await db`
      INSERT INTO users (id, name, emails, created_at)
      VALUES (${id}, ${name}, ${JSON.stringify(emails)}, now())
    `;

    return NextResponse.json({ id, name, emails });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
