use crate::models::WorkspaceMember;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use std::env;

#[derive(Debug, Deserialize)]
struct SupabaseUserResponse {
    pub email: Option<String>,
}

/// Xác thực Supabase Access Token của người dùng và kiểm tra email nằm trong danh sách 2 thành viên Agency
pub async fn authenticate_member(
    http: &Client,
    pool: &PgPool,
    auth_header: Option<&str>,
) -> Result<WorkspaceMember, (u16, String)> {
    let raw = auth_header.ok_or_else(|| (401, "Thiếu header Authorization".to_string()))?;
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))
        .ok_or_else(|| (401, "Định dạng Bearer token không hợp lệ".to_string()))?
        .trim();

    if token.is_empty() {
        return Err((401, "Token rỗng".to_string()));
    }

    let supabase_url = env::var("NEXT_PUBLIC_SUPABASE_URL")
        .or_else(|_| env::var("SUPABASE_URL"))
        .map_err(|_| (500, "Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL".to_string()))?;

    let supabase_anon_key = env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        .or_else(|_| env::var("SUPABASE_ANON_KEY"))
        .map_err(|_| (500, "Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_ANON_KEY".to_string()))?;

    let verify_url = format!("{}/auth/v1/user", supabase_url.trim_end_matches('/'));
    let resp = http
        .get(&verify_url)
        .header("apikey", &supabase_anon_key)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| (502, format!("Lỗi kết nối Supabase Auth: {e}")))?;

    if !resp.status().is_success() {
        return Err((401, "Phiên đăng nhập hết hạn hoặc không hợp lệ".to_string()));
    }

    let user_info: SupabaseUserResponse = resp
        .json()
        .await
        .map_err(|e| (500, format!("Lỗi đọc thông tin người dùng Supabase: {e}")))?;

    let email = user_info
        .email
        .ok_or_else(|| (403, "Tài khoản không có email hợp lệ".to_string()))?;

    let member = sqlx::query_as::<_, WorkspaceMember>(
        "SELECT id, email, display_name, avatar_color, created_at
         FROM public.workspace_members
         WHERE lower(email) = lower($1)
         LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(pool)
    .await
    .map_err(|e| (500, format!("Lỗi truy vấn thành viên: {e}")))?
    .ok_or_else(|| {
        (
            403,
            format!("Email {email} không nằm trong danh sách 2 thành viên của Agency"),
        )
    })?;

    Ok(member)
}

/// Xác thực khóa bí mật cho tiến trình Cron tự động đăng bài (từ Supabase pg_cron hoặc GitHub Actions)
pub fn verify_cron_secret(auth_header: Option<&str>) -> Result<(), (u16, String)> {
    let expected = env::var("CRON_SECRET")
        .map_err(|_| (500, "Chưa cấu hình biến môi trường CRON_SECRET trên Vercel".to_string()))?;

    if expected.trim().is_empty() {
        return Err((500, "CRON_SECRET không được để trống".to_string()));
    }

    let provided = auth_header
        .and_then(|h| h.strip_prefix("Bearer ").or_else(|| h.strip_prefix("bearer ")))
        .map(str::trim)
        .ok_or_else(|| (401, "Thiếu Authorization Bearer cho Cron".to_string()))?;

    if provided != expected.trim() {
        return Err((403, "CRON_SECRET không khớp".to_string()));
    }

    Ok(())
}
