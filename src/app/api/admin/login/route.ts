// فایل کامل: src/app/api/admin/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation';
import { verifyPassword, generateToken } from '@/lib/auth';
import pool from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = loginSchema.parse(body);

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM admins WHERE username = ?',
        [username]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ success: false, message: 'ادمین یافت نشد' }, { status: 404 });
      }

      const admin = rows[0] as any;
      const isPasswordValid = await verifyPassword(password, admin.password_hash);

      if (!isPasswordValid) {
        return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
      }

      // ✅ فراخوانی تابع جدید با زمان انقضا به ثانیه (۱۲ ساعت)
      const twelveHoursInSeconds = 12 * 60 * 60;
      const token = generateToken(admin.id, admin.username, 'admin', twelveHoursInSeconds);

      return NextResponse.json({
        success: true,
        message: 'ورود ادمین موفقیت‌آمیز بود',
        data: { token }
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Admin Login Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}