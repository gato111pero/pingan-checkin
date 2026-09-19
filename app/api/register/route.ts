import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ensureTable, requireSql } from '@/lib/db';
import { hashPassword, generateToken, isValidEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 注册：邮箱 + 密码。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }

    await ensureTable();
    const db = requireSql();

    const existing = await db`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 });
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    await db`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (${id}, ${email}, ${passwordHash}, now())
    `;

    const token = generateToken();
    await db`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${id}, now())`;

    return NextResponse.json({
      token,
      user: { id, email, name: '', emails: [] },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
