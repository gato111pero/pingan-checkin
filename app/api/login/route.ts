import { NextResponse } from 'next/server';
import { ensureTable, requireSql } from '@/lib/db';
import { verifyPassword, generateToken, isValidEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 登录：邮箱 + 密码。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    await ensureTable();
    const db = requireSql();

    const rows = await db`SELECT * FROM users WHERE email = ${email}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    const user = rows[0] as Record<string, unknown>;
    const ok = await verifyPassword(password, String(user.password_hash || ''));
    if (!ok) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    const token = generateToken();
    await db`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, now())`;

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emails: JSON.parse(String(user.emails || '[]')),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
