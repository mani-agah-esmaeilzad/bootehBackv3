// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { verifyPassword, generateToken } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 });
        }

        const [users] = await pool.query<RowDataPacket[]>('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1', [username, username]);

        if (users.length === 0) {
            return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است یا حساب شما غیرفعال است' }, { status: 401 });
        }
        const user = users[0];

        const isPasswordValid = await verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
        }

        // ✅ اصلاح کلیدی: برای کاربر عادی، organizationId همیشه null است
        const token = generateToken(user.id, user.username, 'user', null);

        return NextResponse.json({ 
            success: true, 
            data: { 
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name
                }
            } 
        });

    } catch (err: any) {
        console.error('Login Error:', err);
        return NextResponse.json({ success: false, message: err.message || 'خطای داخلی سرور' }, { status: 500 });
    }
}
