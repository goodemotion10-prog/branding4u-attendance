import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    // Vercel Cron Authentication (보안을 위한 크론 시크릿 인증)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn('Telegram token or chat ID is not set.');
      return NextResponse.json({ success: false, error: 'Telegram credentials not configured' });
    }

    // Supabase 클라이언트 초기화 (서비스 롤 키 우선 사용, 없을 시 anon 키 사용)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 한국 시간(KST) 기준으로 오늘의 '일(Day)' 정보를 구합니다.
    const now = new Date();
    const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const todayDay = kstDate.getDate();

    const { data: payments, error } = await supabase
      .from('client_payments')
      .select('*')
      .eq('payment_day', todayDay)
      .order('client_name', { ascending: true });

    if (error) {
      console.error('Error fetching client payments:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch payment data' }, { status: 500 });
    }

    if (!payments || payments.length === 0) {
      return NextResponse.json({ success: true, message: 'No client payments scheduled for today.' });
    }

    // 텔레그램 메시지 포맷 설정
    let message = `💳 <b>[클라이언트 결제일 알림]</b>\n`;
    message += `오늘(<b>${todayDay}일</b>)은 아래 클라이언트의 결제일입니다.\n\n`;
    
    payments.forEach((p) => {
      const amountStr = p.amount 
        ? `\n   • 결제 금액: <b>${Number(p.amount).toLocaleString('ko-KR')}원</b>` 
        : '';
      const memoStr = p.memo 
        ? `\n   • 비고: ${p.memo}` 
        : '';
      message += `• <b>${p.client_name}</b>${amountStr}${memoStr}\n\n`;
    });
    
    message = message.trim();

    // 텔레그램으로 알림 전송
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    
    if (!data.ok) {
      console.error('Telegram API Error:', data);
      return NextResponse.json({ success: false, error: data.description }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: payments.length });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
