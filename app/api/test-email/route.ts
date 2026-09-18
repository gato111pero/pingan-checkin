import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { sendTestEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/** 发送测试邮件（发到第一个联系人邮箱），用于验证 SMTP 配置。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    await ensureTable();
    const db = requireSql();
    const rows = await db`SELECT emails FROM users WHERE id = ${id}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    const emails = JSON.parse(String(rows[0].emails || '[]')) as string[];
    if (emails.length === 0) {
      return NextResponse.json({ error: '尚未设置联系人邮箱' }, { status: 400 });
    }

    await sendTestEmail(emails[0]);
    return NextResponse.json({ ok: true, to: emails[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
