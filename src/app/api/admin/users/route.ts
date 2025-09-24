// فایل کامل و اصلاح شده: src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromHeader(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
    
    const decodedToken = authenticateToken(token);
    if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT id, username, email, first_name, last_name, is_active, created_at FROM users ORDER BY id DESC'
      );
      return NextResponse.json({ success: true, data: rows });
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
  }
}
