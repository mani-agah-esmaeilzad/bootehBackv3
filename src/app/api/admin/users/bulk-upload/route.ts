// src/app/api/admin/users/bulk-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth'; // تصحیح شد: استفاده از verifyAdmin
import pool from '@/lib/database'; // تصحیح شد: import کردن pool به عنوان default
import bcrypt from 'bcryptjs';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
  // تصحیح شد: روش صحیح اعتبارسنجی ادمین
  const { admin, error: adminError } = await verifyAdmin(req);
  if (adminError) {
    return NextResponse.json({ message: adminError }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: 'هیچ فایلی آپلود نشده است' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet) as any[];

    let createdCount = 0;
    const errors: string[] = [];

    for (const row of data) {
      // ستون userType از اکسل خوانده می‌شود اما در دیتابیس ذخیره نمی‌شود
      const { username, password, email, firstName, lastName } = row;

      if (!username || !password || !email || !firstName || !lastName) {
        errors.push(`ردیف نادیده گرفته شد (فیلدهای اجباری ناقص): ${JSON.stringify(row)}`);
        continue;
      }
      
      // بررسی وجود کاربر با همین ایمیل یا نام کاربری
      const [existingUsers]: any = await pool.query(
          'SELECT id FROM users WHERE username = ? OR email = ?',
          [username, email]
      );

      if (existingUsers.length > 0) {
          errors.push(`کاربر '${username}' یا ایمیل '${email}' از قبل وجود دارد.`);
          continue;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // تصحیح شد: کوئری INSERT با نام ستون‌های صحیح
      await pool.query(
        'INSERT INTO users (username, password_hash, email, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, email, firstName, lastName]
      );
      createdCount++;
    }

    return NextResponse.json({
      message: `${createdCount} کاربر با موفقیت ایجاد شد.`,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('خطا در آپلود گروهی کاربران:', error);
    // در صورت بروز خطا، پیام دقیق‌تری برمی‌گردانیم
    const errorMessage = error instanceof Error ? error.message : 'خطای داخلی سرور';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
