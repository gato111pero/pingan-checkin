import { NextResponse } from 'next/server';
import { ensureTable } from '@/lib/db';
import { sendTestEmail } from '@/lib/mailer';
import { getUserByToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 发送测试邮件到第一个联系人邮箱（需登录）。 */
export async function POST(req: Request) {
  try {
    const user = await getUserByToken(req);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    await ensureTable();

    const emails = JSON.parse(String(user.emails || '[]')) as string[];
    if (emails.length === 0) {
      return NextResponse.json({ error: '尚未设置联系人邮箱' }, { status: 400 });
    }

    await sendTestEmail(emails[0]);
    return NextResponse.json({ ok: true, to: emails[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
