import mysql from 'mysql2/promise';

/**
 * ============================================================================
 * MYSQL CONNECTION POOL (UNTUK XAMPP & LOCALHOST)
 * ============================================================================
 * Konfigurasi default XAMPP:
 * Host     : localhost (127.0.0.1)
 * Port     : 3306
 * User     : root
 * Password : "" (kosong bawaan XAMPP)
 * Database : hts_law_firm
 * ============================================================================
 */

let mysqlPool: mysql.Pool | null = null;
let isMysqlConnected = false;

export function getMysqlConfig() {
  return {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'hts_law_firm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 2000,
  };
}

export async function initMysqlPool(): Promise<mysql.Pool | null> {
  if (mysqlPool && isMysqlConnected) return mysqlPool;

  const config = getMysqlConfig();
  let tempPool: mysql.Pool | null = null;
  try {
    tempPool = mysql.createPool(config);
    // Test initial connection with quick timeout (2.5s) to avoid hanging server startup
    const connectionPromise = tempPool.getConnection();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout to MySQL')), 2500)
    );
    const connection = await Promise.race([connectionPromise, timeoutPromise]);
    await connection.ping();
    connection.release();
    mysqlPool = tempPool;
    isMysqlConnected = true;
    console.log(`[MySQL XAMPP] Berhasil terhubung ke database ${config.database}@${config.host}:${config.port}`);
    return mysqlPool;
  } catch (error: any) {
    isMysqlConnected = false;
    if (tempPool) {
      try {
        await tempPool.end();
      } catch (e) {}
    }
    mysqlPool = null;
    console.warn(`[MySQL Info] Koneksi MySQL lokal (${config.host}:${config.port}) belum aktif:`, error?.message || error);
    return null;
  }
}

export function isMysqlActive(): boolean {
  return isMysqlConnected && mysqlPool !== null;
}

export async function queryMysql<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = await initMysqlPool();
  if (!pool) {
    throw new Error('MySQL pool tidak tersedia. Pastikan Apache & MySQL di XAMPP sudah di-start.');
  }
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}
