// src/lib/auth.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// ✅ اصلاح شد: پارامتر organizationId اضافه شد
export const generateToken = (
  userId: number, 
  username: string, 
  role: 'user' | 'admin' = 'user', 
  organizationId: number | null = null, // ID سازمان (اختیاری)
  expiresInSeconds: number = 7 * 24 * 60 * 60
) => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;

  const payload = { 
    userId, 
    username, 
    role,
    organizationId, // ✅ اضافه شد
    iat,
    exp 
  };
  
  return jwt.sign(payload, JWT_SECRET);
};

export const authenticateToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null; 
  }
};

export const extractTokenFromHeader = (header: string | null | undefined): string | null => {
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.substring(7);
};

export const verifyAdmin = async (req: NextRequest) => {
  const token = extractTokenFromHeader(req.headers.get('Authorization'));
  if (!token) return { admin: null, error: 'توکن احراز هویت ارسال نشده است' };
  const decoded = authenticateToken(token);
  if (!decoded || decoded.role !== 'admin') return { admin: null, error: 'دسترسی غیرمجاز. شما ادمین نیستید.' };
  return { admin: decoded, error: null };
};
