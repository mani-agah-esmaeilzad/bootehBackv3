// src/lib/database.ts
import mysql from 'mysql2/promise';

// پیکربندی دیتابیس از متغیرهای محیطی خوانده می‌شود
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// ایجاد pool connection برای مدیریت بهینه اتصالات
const pool = mysql.createPool(dbConfig);

// تابع برای دریافت اتصال با قابلیت تلاش مجدد در صورت بروز خطا
export async function getConnectionWithRetry(maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = await pool.getConnection();
      return connection;
    } catch (error: any) {
      console.warn(`Connection attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Could not get a database connection after multiple retries.');
}

// تابع برای تست اولیه اتصال به دیتابیس
export async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('✅ اتصال به دیتابیس MySQL با موفقیت برقرار شد.');
    return true;
  } catch (error) {
    console.error('❌ خطا در اتصال به دیتابیس:', error);
    return false;
  } finally {
    if (connection) connection.release();
  }
}

// تابع اصلی برای ساختاردهی و ایجاد تمام جداول مورد نیاز پروژه
export async function createTables() {
  let connection;
  try {
    connection = await pool.getConnection();
    
    console.log("شروع فرآیند ایجاد جداول...");

    // جدول کاربران
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20),
        age INT,
        education_level VARCHAR(100),
        work_experience VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'users' ایجاد شد.");

    // جدول ادمین‌ها
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log("  - جدول 'admins' ایجاد شد.");

    // جدول پرسشنامه‌ها (سناریوهای ارزیابی)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS questionnaires (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        initial_prompt TEXT NOT NULL,
        persona_prompt TEXT NOT NULL,
        analysis_prompt TEXT NOT NULL,
        has_narrator BOOLEAN DEFAULT FALSE,
        character_count INT DEFAULT 1,
        has_timer BOOLEAN DEFAULT TRUE,
        timer_duration INT DEFAULT 15,
        min_questions INT DEFAULT 5,
        max_questions INT DEFAULT 8,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'questionnaires' ایجاد شد.");

    // جدول ارزیابی‌های هر کاربر
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        questionnaire_id INT NOT NULL,
        score INT,
        max_score INT DEFAULT 100,
        description TEXT,
        supplementary_answers JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'assessments' ایجاد شد.");

    // جدول پیام‌های چت برای هر ارزیابی
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assessment_id INT NOT NULL,
        user_id INT NOT NULL,
        message_type ENUM('user', 'ai', 'system') NOT NULL,
        content TEXT NOT NULL,
        character_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'chat_messages' ایجاد شد.");

    // --- شروع جداول جدید برای پنل سازمانی ---

    // جدول سازمان‌ها
    // این جدول اطلاعات اصلی هر سازمان را ذخیره می‌کند
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL, -- آدرس یونیک سازمان، مثلا 'my-company'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("  - جدول 'organizations' ایجاد شد.");

    // جدول اتصال سازمان به پرسشنامه (جدول واسط)
    // مشخص می‌کند که هر سازمان به کدام پرسشنامه‌ها دسترسی دارد
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organization_questionnaires (
        organization_id INT NOT NULL,
        questionnaire_id INT NOT NULL,
        PRIMARY KEY (organization_id, questionnaire_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'organization_questionnaires' ایجاد شد.");

    // جدول اتصال سازمان به کاربر (جدول واسط)
    // مشخص می‌کند که کدام کاربران عضو کدام سازمان هستند
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organization_users (
        organization_id INT NOT NULL,
        user_id INT NOT NULL,
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  - جدول 'organization_users' ایجاد شد.");
    
    // --- پایان جداول جدید ---

    console.log('✅ فرآیند ایجاد جداول با موفقیت به پایان رسید.');
    return true;
  } catch (error) {
    console.error('❌ خطا در هنگام ایجاد جداول:', error);
    return false;
  } finally {
    if (connection) connection.release();
  }
}

export default pool;
