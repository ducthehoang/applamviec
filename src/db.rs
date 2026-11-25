use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::PgPool;
use std::env;
use std::str::FromStr;
use std::time::Duration;
use tokio::sync::OnceCell;

static DB_POOL: OnceCell<PgPool> = OnceCell::const_new();

/// Khởi tạo kết nối PostgreSQL tối ưu cho môi trường Vercel Serverless + Supabase Supavisor Pooler (:6543)
/// Đặt `statement_cache_capacity(0)` để không bị lỗi `prepared statement already exists` trên PgBouncer/Supavisor.
pub async fn get_db_pool() -> Result<&'static PgPool, String> {
    DB_POOL
        .get_or_try_init(|| async {
            let db_url = env::var("DATABASE_URL")
                .map_err(|_| "Thiếu biến môi trường DATABASE_URL trên Vercel".to_string())?;

            let connect_opts = PgConnectOptions::from_str(&db_url)
                .map_err(|e| format!("DATABASE_URL không hợp lệ: {e}"))?
                .statement_cache_capacity(0);

            PgPoolOptions::new()
                .max_connections(3)
                .acquire_timeout(Duration::from_secs(10))
                .idle_timeout(Duration::from_secs(30))
                .connect_with(connect_opts)
                .await
                .map_err(|e| format!("Không thể kết nối Supabase PostgreSQL: {e}"))
        })
        .await
}
