import { NextResponse } from 'next/server';
import { getUserByToken, isAdmin } from '@/lib/auth';
import { runAlertCheck } from '@/lib/alert';

export const dynamic = 'force-dynamic';

/** 管理员：手动执行一次预警检查。 */
export async function POST(req: Request) {
  try {
    const user = await getUserByToken(req);
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!isAdmin(user)) return NextResponse.json({ error: '无权限' }, { status: 403 });

    const result = await runAlertCheck();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
