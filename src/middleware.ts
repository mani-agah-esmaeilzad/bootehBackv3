// فایل کامل: mani-agah-esmaeilzad/test/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // در محیط پروداکشن آدرس دقیق فرانت‌اند را جایگزین کنید
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function middleware(request: NextRequest) {
  // اگر درخواست از نوع OPTIONS (preflight) بود، یک پاسخ خالی با هدرهای صحیح برمی‌گردانیم
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { headers: corsHeaders });
  }

  // برای سایر درخواست‌ها، اجازه می‌دهیم به API route مربوطه بروند
  const response = NextResponse.next();

  // هدرهای CORS را به پاسخ نهایی اضافه می‌کنیم
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// مشخص می‌کنیم که این middleware برای تمام مسیرهای API فعال شود
export const config = {
  matcher: '/api/:path*',
};