import { NextResponse } from 'next/server';
import { runAlertCheck } from '@/lib/alert';

export const dynamic = 'force-dynamic';

/**
 * 定时任务（由 Vercel Cron 每日触发）：检测并发送预警邮件。
 *
 * 鉴权：Vercel 会自动注入 CRON_SECRET 环境变量，并在请求头携带
 * `Authorization: Bearer <CRON_SECRET>`。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const result = await runAlertCheck();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
