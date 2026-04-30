import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    // Vercel Cron Authentication (Optional but recommended for security)
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

    // Initialize Supabase with service role or anon key (need to read users)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // We use anon key because RLS is open for selects now
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get today's date in KST (Korean Standard Time)
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const todayStr = kstDate.toISOString().split('T')[0];

    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select('*, users(name)')
      .eq('request_date', todayStr)
      .eq('status', 'approved');

    if (error) {
      console.error('Error fetching leave requests:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch leave data' }, { status: 500 });
    }

    if (!leaves || leaves.length === 0) {
      return NextResponse.json({ success: true, message: 'No one is on leave today.' });
    }

    // Format the message
    let message = `📢 <b>오늘의 휴가자 알림 (${todayStr})</b>\n\n`;
    leaves.forEach((leave) => {
      const typeStr = leave.type === 'full_day' ? '월차' : leave.type === 'half_day' ? '반차' : '조퇴';
      message += `• <b>${leave.users?.name || '알 수 없는 사용자'}</b> : ${typeStr}\n`;
    });
    message += `\n오늘도 좋은 하루 보내세요!`;

    // Send Telegram Notification
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

    return NextResponse.json({ success: true, count: leaves.length });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
