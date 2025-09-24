import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const password = searchParams.get('password');

    if (!password) {
      return NextResponse.json(
        { success: false, message: 'Please provide a password query parameter. Example: /api/admin/hash-password?password=your_password' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    return NextResponse.json({
      success: true,
      password: password,
      hash: passwordHash,
    });

  } catch (error) {
    console.error('Hashing Error:', error);
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}
