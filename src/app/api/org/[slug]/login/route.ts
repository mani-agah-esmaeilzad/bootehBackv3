// src/app/api/org/[slug]/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { verifyPassword, generateToken } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';

interface Params {
    params: { slug: string };
}

export async function POST(req: NextRequest, { params }: Params) {
    try {
        const { slug } = params;
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 });
        }

        const connection = await pool.getConnection();

        const [users] = await connection.query<RowDataPacket[]>('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1', [username, username]);
        if (users.length === 0) {
            connection.release();
            return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
        }
        const user = users[0];

        const isPasswordValid = await verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
            connection.release();
            return NextResponse.json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
        }

        const [orgs] = await connection.query<RowDataPacket[]>('SELECT id FROM organizations WHERE slug = ?', [slug]);
        if (orgs.length === 0) {
            connection.release();
            return NextResponse.json({ success: false, message: 'سازمان یافت نشد' }, { status: 404 });
        }
        const organizationId = orgs[0].id;

        const [membership] = await connection.query<RowDataPacket[]>('SELECT * FROM organization_users WHERE organization_id = ? AND user_id = ?', [organizationId, user.id]);

        connection.release();

        if (membership.length === 0) {
            return NextResponse.json({ success: false, message: 'شما دسترسی به این پنل سازمانی ندارید' }, { status: 403 });
        }

        // ✅ اطمینان از اینکه ID سازمان به توکن اضافه می‌شود
        const token = generateToken(user.id, user.username, 'user', organizationId);

        return NextResponse.json({ success: true, data: { token } });

    } catch (err) {
        console.error('Org Login Error:', err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
