import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

/**
 * Migration/CLI DataSource (typeorm CLI only — NOT the runtime connection).
 *
 * ⚠️ NGUỒN SỰ THẬT CỦA SCHEMA = TypeORM entities. Schema Postgres production hiện tại
 * được tạo bằng `synchronize` MỘT LẦN từ entities (bảng `migrations` rỗng → CHƯA từng
 * chạy migration nào). Bản chụp tái lập nằm ở `backend/db/schema.postgres.sql`
 * (xem `backend/db/README.md`).
 *
 * Cấu hình này được giữ ĐỒNG BỘ với `app.module.ts` (cùng DB_TYPE/host/schema) để khi
 * dùng TypeORM CLI sẽ trỏ đúng DB. Lưu ý: hiện có vài entity TRÙNG tên bảng giữa
 * `src/entities/` và `src/modules/pricing/entities/` → `migration:generate` có thể lỗi
 * "duplicate entity"; đây là nợ kỹ thuật đã ghi nhận trong db/README.md.
 */

// Load .env (cùng file app.module dùng)
config({ path: path.join(__dirname, '..', '..', '.env') });

const dbType = process.env.DB_TYPE || 'sqlite';
console.log(`[TypeORM CLI] DB_TYPE=${dbType}`);

const entities = [__dirname + '/../**/*.entity{.ts,.js}'];
const migrations = [__dirname + '/../migrations/*{.ts,.js}'];

export const AppDataSource = new DataSource(
  dbType === 'postgres'
    ? {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'zeplao_erp',
        schema: 'public',
        entities,
        migrations,
        synchronize: false,
      }
    : {
        type: 'sqlite',
        // Khớp với app.module.ts (trước đây trỏ sai sang '_backup/erp-dev.sqlite').
        database: '_backup/zeplao-dev.sqlite',
        entities,
        migrations,
        synchronize: false,
      }
);
