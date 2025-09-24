import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { z } from 'zod';

// این خط به Next.js می‌گوید که این مسیر همیشه باید به صورت پویا اجرا شود
// چون ما به هدرهای درخواست برای احراز هویت نیاز داریم.
export const dynamic = 'force-dynamic';

// Schema برای اعتبارسنجی داده‌های ورودی
const statusUpdateSchema = z.object({
  is_active: z.boolean(),
});

/**
 * @route PUT /api/admin/users/[id]/status
 * @description وضعیت فعال/غیرفعال بودن یک کاربر را به‌روزرسانی می‌کند.
 * @access Admin
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. احراز هویت و بررسی نقش ادمین
    const token = extractTokenFromHeader(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
    }
    
    const decodedToken = authenticateToken(token);
    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز. شما ادمین نیستید.' }, { status: 403 });
    }

    const userId = parseInt(params.id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ success: false, message: 'ID کاربر نامعتبر است' }, { status: 400 });
    }

    // 2. دریافت و اعتبارسنجی بدنه درخواست
    const body = await request.json();
    const validation = statusUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, message: 'داده ورودی نامعتبر است. فیلد `is_active` باید از نوع boolean باشد.' }, { status: 400 });
    }
    
    const { is_active } = validation.data;

    // 3. به‌روزرسانی وضعیت کاربر در دیتابیس
    const connection = await pool.getConnection();
    try {
      const [result]: any = await connection.execute(
        'UPDATE users SET is_active = ? WHERE id = ?',
        [is_active, userId]
      );

      if (result.affectedRows === 0) {
        return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
      }

      const statusText = is_active ? "فعال" : "غیرفعال";
      return NextResponse.json({ success: true, message: `وضعیت کاربر با موفقیت به ${statusText} تغییر یافت` });

    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error(`Error updating user status for ID ${params.id}:`, error);
    // مدیریت خطاهای احتمالی دیگر
    if (error.message.includes('توکن')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
  }
}
