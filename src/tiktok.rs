use crate::gdrive::download_drive_file_bytes;
use crate::models::{MediaFile, ScheduledPost, SocialChannel};
use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::env;

const TIKTOK_API_BASE: &str = "https://open.tiktokapis.com/v2";

/// Đổi mã OAuth2 v2 của TikTok lấy Access Token (24h) + Refresh Token (365 ngày)
/// Đồng thời gọi `creator_info/query` để lưu cấu hình quyền riêng tư hợp lệ của kênh TikTok
pub async fn connect_tiktok_oauth(
    http: &Client,
    pool: &PgPool,
    code: &str,
    redirect_uri: &str,
    connected_by: &str,
) -> Result<SocialChannel, String> {
    let client_key = env::var("TIKTOK_CLIENT_KEY")
        .map_err(|_| "Thiếu biến môi trường TIKTOK_CLIENT_KEY".to_string())?;
    let client_secret = env::var("TIKTOK_CLIENT_SECRET")
        .map_err(|_| "Thiếu biến môi trường TIKTOK_CLIENT_SECRET".to_string())?;

    let token_resp: Value = http
        .post(format!("{TIKTOK_API_BASE}/oauth/token/"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("client_key", client_key.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối TikTok OAuth2: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc JSON TikTok OAuth2: {e}"))?;

    let access_token = token_resp["access_token"]
        .as_str()
        .ok_or_else(|| format!("TikTok không trả về access_token: {token_resp}"))?;
    let refresh_token = token_resp["refresh_token"].as_str().map(String::from);
    let open_id = token_resp["open_id"]
        .as_str()
        .unwrap_or("tiktok_creator")
        .to_string();
    let expires_in = token_resp["expires_in"].as_i64().unwrap_or(86400);

    // Gọi creator_info/query để lấy tên kênh, ảnh đại diện & privacy_level_options
    let creator_info = fetch_creator_info_with_token(http, access_token)
        .await
        .unwrap_or_else(|_| json!({}));

    let username = creator_info["data"]["creator_nickname"]
        .as_str()
        .or_else(|| creator_info["data"]["creator_username"].as_str())
        .unwrap_or("Kênh TikTok Agency")
        .to_string();
    let avatar_url = creator_info["data"]["creator_avatar_url"]
        .as_str()
        .map(String::from);

    let expires_at = Utc::now() + Duration::seconds(expires_in - 120);
    let extra = json!({
        "scope": token_resp["scope"],
        "creator_info": creator_info["data"]
    });

    sqlx::query_as::<_, SocialChannel>(
        "INSERT INTO public.social_channels
            (provider, account_id, account_name, avatar_url, access_token, refresh_token, token_expires_at, extra_config, connected_by)
         VALUES ('tiktok', $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (provider, account_id) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            avatar_url = COALESCE(EXCLUDED.avatar_url, public.social_channels.avatar_url),
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, public.social_channels.refresh_token),
            token_expires_at = EXCLUDED.token_expires_at,
            extra_config = EXCLUDED.extra_config,
            connected_by = EXCLUDED.connected_by,
            updated_at = now()
         RETURNING *",
    )
    .bind(&open_id)
    .bind(&username)
    .bind(avatar_url)
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(extra)
    .bind(connected_by)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Lỗi lưu kết nối TikTok vào DB: {e}"))
}

/// Lấy Access Token còn hạn của TikTok (tự động xoay vòng qua refresh_token 365 ngày)
pub async fn get_valid_tiktok_token(http: &Client, pool: &PgPool) -> Result<String, String> {
    let channel = sqlx::query_as::<_, SocialChannel>(
        "SELECT * FROM public.social_channels WHERE provider = 'tiktok' ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Lỗi truy vấn kênh TikTok: {e}"))?
    .ok_or_else(|| "Chưa kết nối tài khoản TikTok trong mục Cài đặt".to_string())?;

    let needs_refresh = match channel.token_expires_at {
        Some(exp) => exp <= Utc::now() + Duration::minutes(5),
        None => true,
    };

    if !needs_refresh {
        return Ok(channel.access_token);
    }

    let refresh_tok = channel
        .refresh_token
        .ok_or_else(|| "Thiếu refresh_token TikTok, vui lòng kết nối lại TikTok".to_string())?;
    let client_key = env::var("TIKTOK_CLIENT_KEY")
        .map_err(|_| "Thiếu TIKTOK_CLIENT_KEY".to_string())?;
    let client_secret = env::var("TIKTOK_CLIENT_SECRET")
        .map_err(|_| "Thiếu TIKTOK_CLIENT_SECRET".to_string())?;

    let resp: Value = http
        .post(format!("{TIKTOK_API_BASE}/oauth/token/"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("client_key", client_key.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_tok.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi làm mới token TikTok: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc JSON làm mới token TikTok: {e}"))?;

    let new_access = resp["access_token"]
        .as_str()
        .ok_or_else(|| format!("Không thể làm mới token TikTok: {resp}"))?;
    let new_refresh = resp["refresh_token"].as_str().unwrap_or(&refresh_tok);
    let expires_in = resp["expires_in"].as_i64().unwrap_or(86400);
    let new_expires_at = Utc::now() + Duration::seconds(expires_in - 120);

    sqlx::query(
        "UPDATE public.social_channels
         SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = now()
         WHERE id = $4",
    )
    .bind(new_access)
    .bind(new_refresh)
    .bind(new_expires_at)
    .bind(channel.id)
    .execute(pool)
    .await
    .map_err(|e| format!("Lỗi lưu token TikTok mới: {e}"))?;

    Ok(new_access.to_string())
}

pub async fn fetch_creator_info_with_token(http: &Client, access_token: &str) -> Result<Value, String> {
    let resp: Value = http
        .post(format!("{TIKTOK_API_BASE}/post/publish/creator_info/query/"))
        .bearer_auth(access_token)
        .header("Content-Type", "application/json; charset=UTF-8")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("Lỗi gọi TikTok creator_info/query: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc JSON creator_info/query: {e}"))?;

    Ok(resp)
}

/// Đăng video lên TikTok hỗ trợ cả 2 chế độ:
/// - `direct_post = true`: Đăng thẳng lên kênh (`video.publish`) — tự động kiểm tra `privacy_level_options` để tránh lỗi Sandbox `SELF_ONLY`!
/// - `direct_post = false`: Đẩy vào Hộp thư Nháp trên app TikTok (`video.upload`) để chèn nhạc trending rồi bấm đăng 1 chạm!
pub async fn publish_to_tiktok(
    http: &Client,
    pool: &PgPool,
    post: &ScheduledPost,
    media_list: &[MediaFile],
    direct_post: bool,
) -> Result<Value, String> {
    let video_file = media_list
        .iter()
        .find(|m| m.media_kind == "video")
        .ok_or_else(|| "TikTok yêu cầu bài đăng có ít nhất 1 file Video (.mp4 / .mov / .webm)".to_string())?;

    let access_token = get_valid_tiktok_token(http, pool).await?;
    let video_bytes = download_drive_file_bytes(http, pool, &video_file.gdrive_file_id).await?;
    let total_size = video_bytes.len();

    if total_size == 0 {
        return Err("File video tải từ Google Drive bị rỗng (0 bytes)".to_string());
    }

    // Tính kích thước chunk chuẩn theo quy định của TikTok FILE_UPLOAD (tối thiểu 5MB trừ khi file nhỏ hơn 5MB, tối đa 64MB)
    let default_chunk: usize = 10 * 1024 * 1024; // 10 MB
    let (chunk_size, total_chunk_count) = if total_size <= default_chunk {
        (total_size, 1usize)
    } else {
        let count = total_size / default_chunk;
        // Quy tắc TikTok: chunk cuối cùng có thể lớn hơn chunk_size (gộp phần dư vào chunk cuối để không sinh chunk lẻ < 5MB)
        (default_chunk, count)
    };

    let init_endpoint = if direct_post {
        // Bước bắt buộc của TikTok Direct Post: truy vấn creator_info/query trước để xác thực privacy_level hợp lệ
        format!("{TIKTOK_API_BASE}/post/publish/video/init/")
    } else {
        format!("{TIKTOK_API_BASE}/post/publish/inbox/video/init/")
    };

    let init_payload = if direct_post {
        let creator = fetch_creator_info_with_token(http, &access_token).await?;
        let allowed_levels: Vec<String> = creator["data"]["privacy_level_options"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        // Nếu App đang ở chế độ Sandbox/Unaudited, TikTok chỉ cho phép SELF_ONLY -> tự điều chỉnh để không gãy tiến trình auto-post
        let effective_privacy = if allowed_levels.is_empty()
            || allowed_levels.contains(&post.tiktok_privacy_level)
        {
            post.tiktok_privacy_level.clone()
        } else if allowed_levels.contains(&"SELF_ONLY".to_string()) {
            "SELF_ONLY".to_string()
        } else {
            allowed_levels[0].clone()
        };

        json!({
            "post_info": {
                "title": post.caption,
                "privacy_level": effective_privacy,
                "disable_comment": post.tiktok_disable_comment,
                "disable_duet": post.tiktok_disable_duet,
                "disable_stitch": post.tiktok_disable_stitch
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": total_size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunk_count
            }
        })
    } else {
        json!({
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": total_size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunk_count
            }
        })
    };

    let init_resp: Value = http
        .post(&init_endpoint)
        .bearer_auth(&access_token)
        .header("Content-Type", "application/json; charset=UTF-8")
        .json(&init_payload)
        .send()
        .await
        .map_err(|e| format!("Lỗi khởi tạo upload video TikTok: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc phản hồi init từ TikTok: {e}"))?;

    let err_code = init_resp["error"]["code"].as_str().unwrap_or("ok");
    if err_code != "ok" {
        return Err(format!("TikTok từ chối khởi tạo đăng video ({err_code}): {init_resp}"));
    }

    let publish_id = init_resp["data"]["publish_id"]
        .as_str()
        .ok_or_else(|| format!("TikTok không trả về publish_id: {init_resp}"))?;
    let upload_url = init_resp["data"]["upload_url"]
        .as_str()
        .ok_or_else(|| format!("TikTok không trả về upload_url: {init_resp}"))?;

    // Truyền tuần tự từng chunk lên máy chủ TikTok kèm Content-Range chuẩn
    for idx in 0..total_chunk_count {
        let start = idx * chunk_size;
        let end_exclusive = if idx + 1 == total_chunk_count {
            total_size
        } else {
            start + chunk_size
        };
        let slice = video_bytes.slice(start..end_exclusive);
        let content_range = format!("bytes {}-{}/{}", start, end_exclusive - 1, total_size);

        let put_resp = http
            .put(upload_url)
            .header("Content-Type", &video_file.mime_type)
            .header("Content-Length", slice.len().to_string())
            .header("Content-Range", content_range)
            .body(slice)
            .send()
            .await
            .map_err(|e| format!("Lỗi truyền chunk {}/{} lên TikTok: {e}", idx + 1, total_chunk_count))?;

        if !put_resp.status().is_success() {
            let status = put_resp.status();
            let text = put_resp.text().await.unwrap_or_default();
            return Err(format!("TikTok lỗi nhận chunk video ({status}): {text}"));
        }
    }

    Ok(json!({
        "mode": if direct_post { "tiktok_direct" } else { "tiktok_inbox_draft" },
        "publish_id": publish_id,
        "total_bytes": total_size,
        "note": if direct_post {
            "Đã gửi xuất bản trực tiếp lên kênh TikTok"
        } else {
            "Đã đẩy vào Hộp thư thông báo trên ứng dụng TikTok (mở điện thoại để chọn nhạc & xuất bản)"
        }
    }))
}
