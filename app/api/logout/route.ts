import { NextResponse } from 'next/server';
import { requireSql } from '@/lib/db';
import { extractToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 登出：删除当前会话 token。 */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (token) {
      const db = requireSql();
      await db`DELETE FROM sessions WHERE token = ${token}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
