use crate::models::{InitDriveUploadInput, InitDriveUploadOutput, SocialChannel};
use bytes::Bytes;
use chrono::{Duration, Utc};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::env;

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

/// Đổi mã OAuth2 Google lấy Refresh Token dài hạn và khởi tạo thư mục gốc trên Google Drive 15GB
pub async fn connect_google_drive(
    http: &Client,
    pool: &PgPool,
    code: &str,
    redirect_uri: &str,
    connected_by: &str,
) -> Result<SocialChannel, String> {
    let client_id = env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| "Thiếu biến môi trường GOOGLE_CLIENT_ID".to_string())?;
    let client_secret = env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "Thiếu biến môi trường GOOGLE_CLIENT_SECRET".to_string())?;

    let token_resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi gọi Google OAuth2: {e}"))?;

    if !token_resp.status().is_success() {
        let err_text = token_resp.text().await.unwrap_or_default();
        return Err(format!("Google từ chối mã OAuth2: {err_text}"));
    }

    let token_data: GoogleTokenResponse = token_resp
        .json()
        .await
        .map_err(|e| format!("Lỗi giải mã Google token: {e}"))?;

    // Lấy thông tin tài khoản Drive & dung lượng 15GB
    let about_resp: Value = http
        .get("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota")
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .map_err(|e| format!("Lỗi đọc thông tin Google Drive: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc JSON Google Drive About: {e}"))?;

    let email = about_resp["user"]["emailAddress"]
        .as_str()
        .unwrap_or("drive-agency@gmail.com")
        .to_string();
    let display_name = about_resp["user"]["displayName"]
        .as_str()
        .unwrap_or(&email)
        .to_string();
    let avatar_url = about_resp["user"]["photoLink"].as_str().map(String::from);

    // Tạo sẵn thư mục gốc "DuoAgency_Hub_Media" trên Google Drive
    let root_folder_id = ensure_drive_folder(http, &token_data.access_token, "DuoAgency_Hub_Media", None).await?;

    let expires_at = Utc::now() + Duration::seconds(token_data.expires_in - 60);
    let extra = json!({
        "root_folder_id": root_folder_id,
        "storage_quota": about_resp["storageQuota"],
        "email": email
    });

    let channel = sqlx::query_as::<_, SocialChannel>(
        "INSERT INTO public.social_channels
            (provider, account_id, account_name, avatar_url, access_token, refresh_token, token_expires_at, extra_config, connected_by)
         VALUES ('google_drive', $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (provider, account_id) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            avatar_url = EXCLUDED.avatar_url,
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, public.social_channels.refresh_token),
            token_expires_at = EXCLUDED.token_expires_at,
            extra_config = EXCLUDED.extra_config,
            connected_by = EXCLUDED.connected_by,
            updated_at = now()
         RETURNING *",
    )
    .bind(&email)
    .bind(format!("{display_name} ({email})"))
    .bind(avatar_url)
    .bind(&token_data.access_token)
    .bind(token_data.refresh_token)
    .bind(expires_at)
    .bind(extra)
    .bind(connected_by)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Lỗi lưu kết nối Google Drive vào DB: {e}"))?;

    Ok(channel)
}

/// Tự động lấy Access Token còn hạn của Google Drive (tự refresh nếu sắp hết hạn)
pub async fn get_valid_drive_channel(http: &Client, pool: &PgPool) -> Result<(String, Option<String>), String> {
    let channel = sqlx::query_as::<_, SocialChannel>(
        "SELECT * FROM public.social_channels WHERE provider = 'google_drive' ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Lỗi đọc kết nối Google Drive: {e}"))?
    .ok_or_else(|| "Chưa kết nối tài khoản Google Drive chung trong mục Cài đặt".to_string())?;

    let root_folder_id = channel.extra_config["root_folder_id"].as_str().map(String::from);

    let needs_refresh = match channel.token_expires_at {
        Some(exp) => exp <= Utc::now() + Duration::minutes(3),
        None => true,
    };

    if !needs_refresh {
        return Ok((channel.access_token, root_folder_id));
    }

    let refresh_token = channel
        .refresh_token
        .ok_or_else(|| "Thiếu refresh_token Google Drive. Vui lòng bấm Kết nối lại Google Drive.".to_string())?;
    let client_id = env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| "Thiếu GOOGLE_CLIENT_ID".to_string())?;
    let client_secret = env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "Thiếu GOOGLE_CLIENT_SECRET".to_string())?;

    let resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi làm mới token Google Drive: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Không thể làm mới token Google Drive: {body}"));
    }

    let refreshed: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc token mới từ Google: {e}"))?;

    let new_expires = Utc::now() + Duration::seconds(refreshed.expires_in - 60);
    sqlx::query(
        "UPDATE public.social_channels SET access_token = $1, token_expires_at = $2, updated_at = now() WHERE id = $3",
    )
    .bind(&refreshed.access_token)
    .bind(new_expires)
    .bind(channel.id)
    .execute(pool)
    .await
    .map_err(|e| format!("Lỗi cập nhật token Google Drive: {e}"))?;

    Ok((refreshed.access_token, root_folder_id))
}

/// Tạo thư mục trên Google Drive để đồng bộ cấu trúc với Web App
pub async fn ensure_drive_folder(
    http: &Client,
    access_token: &str,
    folder_name: &str,
    parent_drive_id: Option<&str>,
) -> Result<String, String> {
    let mut metadata = json!({
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    });
    if let Some(pid) = parent_drive_id {
        metadata["parents"] = json!([pid]);
    }

    let resp = http
        .post("https://www.googleapis.com/drive/v3/files?fields=id")
        .bearer_auth(access_token)
        .json(&metadata)
        .send()
        .await
        .map_err(|e| format!("Lỗi tạo thư mục trên Google Drive: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Google Drive từ chối tạo thư mục: {text}"));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc ID thư mục Drive: {e}"))?;

    data["id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "Google Drive không trả về ID thư mục".to_string())
}

/// Khởi tạo Google Drive Resumable Upload URI để trình duyệt bắn thẳng file nặng (vượt giới hạn 4.5MB của Vercel!)
pub async fn init_resumable_upload(
    http: &Client,
    pool: &PgPool,
    input: &InitDriveUploadInput,
) -> Result<InitDriveUploadOutput, String> {
    let (access_token, root_folder_id) = get_valid_drive_channel(http, pool).await?;

    let mut target_parent = root_folder_id;
    if let Some(folder_uuid) = input.folder_id {
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT gdrive_folder_id FROM public.folders WHERE id = $1",
        )
        .bind(folder_uuid)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Lỗi tra cứu thư mục đích: {e}"))?;

        if let Some((Some(fid),)) = row {
            target_parent = Some(fid);
        }
    }

    let mut metadata = json!({
        "name": input.file_name,
        "mimeType": input.mime_type
    });
    if let Some(ref pid) = target_parent {
        metadata["parents"] = json!([pid]);
    }

    let mut req = http
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink,size")
        .bearer_auth(&access_token)
        .header("X-Upload-Content-Type", &input.mime_type)
        .header("X-Upload-Content-Length", input.size_bytes.to_string());

    // Bắt buộc truyền Origin để Google Drive cấp phép CORS cho trình duyệt upload trực tiếp
    if let Some(ref origin) = input.origin {
        req = req.header("Origin", origin);
    }

    let resp = req
        .json(&metadata)
        .send()
        .await
        .map_err(|e| format!("Lỗi khởi tạo phiên upload Google Drive: {e}"))?;

    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("Google Drive không cấp phiên Resumable Upload: {err_body}"));
    }

    let upload_url = resp
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .ok_or_else(|| "Google Drive không trả về header Location cho Resumable Upload".to_string())?;

    Ok(InitDriveUploadOutput {
        upload_url,
        target_gdrive_folder_id: target_parent,
    })
}

/// Tải nội dung nhị phân của file từ Google Drive để đẩy sang Facebook Graph API / TikTok API khi đăng tự động
pub async fn download_drive_file_bytes(
    http: &Client,
    pool: &PgPool,
    gdrive_file_id: &str,
) -> Result<Bytes, String> {
    let (access_token, _) = get_valid_drive_channel(http, pool).await?;
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        gdrive_file_id
    );

    let resp = http
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Lỗi tải file gốc từ Google Drive ({gdrive_file_id}): {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Google Drive trả lỗi {status} khi đọc file {gdrive_file_id}: {text}"));
    }

    resp.bytes()
        .await
        .map_err(|e| format!("Lỗi đọc luồng dữ liệu từ Google Drive: {e}"))
}
