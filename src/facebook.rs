use crate::gdrive::download_drive_file_bytes;
use crate::models::{ConnectFacebookManualInput, MediaFile, SocialChannel};
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::env;

const FB_GRAPH_BASE: &str = "https://graph.facebook.com/v22.0";
const FB_VIDEO_BASE: &str = "https://graph-video.facebook.com/v22.0";

/// Kết nối Fanpage qua Facebook Login OAuth2:
/// Đổi User Token ngắn hạn -> Long-Lived User Token (60 ngày) -> Page Access Token vĩnh viễn của Fanpage
pub async fn connect_facebook_oauth(
    http: &Client,
    pool: &PgPool,
    code: &str,
    redirect_uri: &str,
    connected_by: &str,
) -> Result<Vec<SocialChannel>, String> {
    let app_id = env::var("FACEBOOK_APP_ID")
        .map_err(|_| "Thiếu biến môi trường FACEBOOK_APP_ID".to_string())?;
    let app_secret = env::var("FACEBOOK_APP_SECRET")
        .map_err(|_| "Thiếu biến môi trường FACEBOOK_APP_SECRET".to_string())?;

    // Bước 1: Đổi code lấy short-lived user token
    let short_resp: Value = http
        .get(format!("{FB_GRAPH_BASE}/oauth/access_token"))
        .query(&[
            ("client_id", app_id.as_str()),
            ("client_secret", app_secret.as_str()),
            ("redirect_uri", redirect_uri),
            ("code", code),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi gọi Facebook OAuth: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc JSON Facebook OAuth: {e}"))?;

    let short_token = short_resp["access_token"]
        .as_str()
        .ok_or_else(|| format!("Facebook không trả về access_token: {short_resp}"))?;

    // Bước 2: Đổi sang Long-Lived User Token
    let long_resp: Value = http
        .get(format!("{FB_GRAPH_BASE}/oauth/access_token"))
        .query(&[
            ("grant_type", "fb_exchange_token"),
            ("client_id", app_id.as_str()),
            ("client_secret", app_secret.as_str()),
            ("fb_exchange_token", short_token),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi đổi Long-Lived Token Facebook: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc Long-Lived Token: {e}"))?;

    let long_user_token = long_resp["access_token"]
        .as_str()
        .unwrap_or(short_token);

    // Bước 3: Lấy danh sách Fanpage mà tài khoản này quản trị (kèm Page Access Token không hết hạn)
    let pages_resp: Value = http
        .get(format!("{FB_GRAPH_BASE}/me/accounts"))
        .query(&[
            ("fields", "id,name,access_token,category,picture{url}"),
            ("access_token", long_user_token),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi lấy danh sách Fanpage: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc danh sách Fanpage: {e}"))?;

    let pages = pages_resp["data"]
        .as_array()
        .ok_or_else(|| format!("Không đọc được danh sách Fanpage từ Meta: {pages_resp}"))?;

    if pages.is_empty() {
        return Err("Tài khoản Facebook này chưa được cấp quyền Quản trị trên Fanpage nào hoặc chưa tích chọn Fanpage khi đăng nhập.".to_string());
    }

    let mut saved = Vec::new();
    for p in pages {
        let page_id = p["id"].as_str().unwrap_or_default();
        let page_name = p["name"].as_str().unwrap_or("Fanpage");
        let page_token = p["access_token"].as_str().unwrap_or_default();
        let avatar_url = p["picture"]["data"]["url"].as_str().map(String::from);

        if page_id.is_empty() || page_token.is_empty() {
            continue;
        }

        let ch = upsert_fb_page_channel(
            pool,
            page_id,
            page_name,
            avatar_url,
            page_token,
            json!({ "category": p["category"], "auth_mode": "oauth_long_lived_page_token" }),
            connected_by,
        )
        .await?;
        saved.push(ch);
    }

    Ok(saved)
}

/// Kết nối nhanh Fanpage bằng Page Access Token (System User Token hoặc Graph Explorer Long-Lived Page Token)
pub async fn connect_facebook_manual(
    http: &Client,
    pool: &PgPool,
    input: &ConnectFacebookManualInput,
    connected_by: &str,
) -> Result<SocialChannel, String> {
    let verify_resp: Value = http
        .get(format!("{FB_GRAPH_BASE}/{}", input.page_id.trim()))
        .query(&[
            ("fields", "id,name,picture{url}"),
            ("access_token", input.page_access_token.trim()),
        ])
        .send()
        .await
        .map_err(|e| format!("Lỗi kiểm tra Page Access Token với Facebook: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc phản hồi từ Facebook: {e}"))?;

    if let Some(err_obj) = verify_resp.get("error") {
        return Err(format!("Page Token không hợp lệ: {err_obj}"));
    }

    let verified_id = verify_resp["id"].as_str().unwrap_or(input.page_id.trim());
    let verified_name = verify_resp["name"].as_str().unwrap_or(input.page_name.trim());
    let avatar_url = verify_resp["picture"]["data"]["url"].as_str().map(String::from);

    upsert_fb_page_channel(
        pool,
        verified_id,
        verified_name,
        avatar_url,
        input.page_access_token.trim(),
        json!({ "auth_mode": "system_or_manual_page_token" }),
        connected_by,
    )
    .await
}

async fn upsert_fb_page_channel(
    pool: &PgPool,
    page_id: &str,
    page_name: &str,
    avatar_url: Option<String>,
    page_token: &str,
    extra: Value,
    connected_by: &str,
) -> Result<SocialChannel, String> {
    sqlx::query_as::<_, SocialChannel>(
        "INSERT INTO public.social_channels
            (provider, account_id, account_name, avatar_url, access_token, extra_config, connected_by)
         VALUES ('facebook_page', $1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, account_id) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            avatar_url = COALESCE(EXCLUDED.avatar_url, public.social_channels.avatar_url),
            access_token = EXCLUDED.access_token,
            extra_config = EXCLUDED.extra_config,
            connected_by = EXCLUDED.connected_by,
            updated_at = now()
         RETURNING *",
    )
    .bind(page_id)
    .bind(page_name)
    .bind(avatar_url)
    .bind(page_token)
    .bind(extra)
    .bind(connected_by)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Lỗi lưu Fanpage vào cơ sở dữ liệu: {e}"))
}

/// Đăng bài lên Fanpage chung (Hỗ trợ Bài chữ, 1 Ảnh, Album nhiều ảnh, Video thường và Facebook Reels)
pub async fn publish_to_facebook_page(
    http: &Client,
    pool: &PgPool,
    caption: &str,
    media_list: &[MediaFile],
    as_reel: bool,
) -> Result<Value, String> {
    let channel = sqlx::query_as::<_, SocialChannel>(
        "SELECT * FROM public.social_channels WHERE provider = 'facebook_page' ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Lỗi truy vấn Fanpage đã kết nối: {e}"))?
    .ok_or_else(|| "Chưa kết nối Fanpage Facebook trong mục Cài đặt".to_string())?;

    let page_id = &channel.account_id;
    let token = &channel.access_token;

    // Trường hợp 1: Đăng Facebook Reels (3 giai đoạn: start -> binary transfer -> finish)
    if as_reel {
        let video_file = media_list
            .iter()
            .find(|m| m.media_kind == "video")
            .ok_or_else(|| "Facebook Reels yêu cầu đính kèm ít nhất 1 file Video".to_string())?;

        let video_bytes = download_drive_file_bytes(http, pool, &video_file.gdrive_file_id).await?;

        // Phase 1: Start
        let start_resp: Value = http
            .post(format!("{FB_GRAPH_BASE}/{page_id}/video_reels"))
            .form(&[
                ("upload_phase", "start"),
                ("access_token", token.as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("Lỗi khởi tạo phiên Facebook Reels: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc JSON khởi tạo Facebook Reels: {e}"))?;

        let video_id = start_resp["video_id"]
            .as_str()
            .ok_or_else(|| format!("Facebook Reels không trả về video_id: {start_resp}"))?;
        let upload_url = start_resp["upload_url"]
            .as_str()
            .ok_or_else(|| format!("Facebook Reels không trả về upload_url: {start_resp}"))?;

        // Phase 2: Binary Transfer
        let transfer_resp: Value = http
            .post(upload_url)
            .header("Authorization", format!("OAuth {token}"))
            .header("offset", "0")
            .header("file_size", video_bytes.len().to_string())
            .body(video_bytes)
            .send()
            .await
            .map_err(|e| format!("Lỗi tải dữ liệu video lên Facebook Reels: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc kết quả tải Facebook Reels: {e}"))?;

        if let Some(err) = transfer_resp.get("error") {
            return Err(format!("Lỗi upload binary Facebook Reels: {err}"));
        }

        // Phase 3: Finish & Publish
        let finish_resp: Value = http
            .post(format!("{FB_GRAPH_BASE}/{page_id}/video_reels"))
            .form(&[
                ("upload_phase", "finish"),
                ("video_id", video_id),
                ("video_state", "PUBLISHED"),
                ("description", caption),
                ("access_token", token.as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("Lỗi xuất bản Facebook Reels: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc kết quả xuất bản Facebook Reels: {e}"))?;

        if let Some(err) = finish_resp.get("error") {
            return Err(format!("Facebook từ chối xuất bản Reels: {err}"));
        }

        return Ok(json!({
            "mode": "facebook_reels",
            "page_id": page_id,
            "video_id": video_id,
            "url": format!("https://www.facebook.com/reel/{video_id}"),
            "raw": finish_resp
        }));
    }

    // Trường hợp 2: Bài viết không có media (chỉ văn bản/link)
    if media_list.is_empty() {
        let resp: Value = http
            .post(format!("{FB_GRAPH_BASE}/{page_id}/feed"))
            .form(&[("message", caption), ("access_token", token.as_str())])
            .send()
            .await
            .map_err(|e| format!("Lỗi đăng bài chữ lên Fanpage: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc phản hồi Fanpage: {e}"))?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Facebook Graph API báo lỗi: {err}"));
        }
        let post_id = resp["id"].as_str().unwrap_or_default();
        return Ok(json!({
            "mode": "text_feed",
            "post_id": post_id,
            "url": format!("https://www.facebook.com/{post_id}")
        }));
    }

    // Trường hợp 3: Có Video thường trên Feed Fanpage
    if let Some(video_file) = media_list.iter().find(|m| m.media_kind == "video") {
        let bytes = download_drive_file_bytes(http, pool, &video_file.gdrive_file_id).await?;
        let part = Part::bytes(bytes.to_vec())
            .file_name(video_file.name.clone())
            .mime_str(&video_file.mime_type)
            .map_err(|e| format!("MIME video không hợp lệ: {e}"))?;

        let form = Form::new()
            .text("description", caption.to_string())
            .text("access_token", token.clone())
            .part("source", part);

        let resp: Value = http
            .post(format!("{FB_VIDEO_BASE}/{page_id}/videos"))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Lỗi tải video lên Fanpage: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc kết quả tải video Fanpage: {e}"))?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Facebook từ chối video: {err}"));
        }
        let vid = resp["id"].as_str().unwrap_or_default();
        return Ok(json!({
            "mode": "video_feed",
            "video_id": vid,
            "url": format!("https://www.facebook.com/{page_id}/videos/{vid}")
        }));
    }

    // Trường hợp 4: Đăng 1 ảnh duy nhất
    let images: Vec<&MediaFile> = media_list.iter().filter(|m| m.media_kind == "image").collect();
    if images.len() == 1 {
        let img = images[0];
        let bytes = download_drive_file_bytes(http, pool, &img.gdrive_file_id).await?;
        let part = Part::bytes(bytes.to_vec())
            .file_name(img.name.clone())
            .mime_str(&img.mime_type)
            .map_err(|e| format!("MIME ảnh không hợp lệ: {e}"))?;

        let form = Form::new()
            .text("caption", caption.to_string())
            .text("access_token", token.clone())
            .part("source", part);

        let resp: Value = http
            .post(format!("{FB_GRAPH_BASE}/{page_id}/photos"))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Lỗi đăng ảnh lên Fanpage: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc kết quả đăng ảnh: {e}"))?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Facebook từ chối ảnh: {err}"));
        }
        let post_id = resp["post_id"]
            .as_str()
            .or_else(|| resp["id"].as_str())
            .unwrap_or_default();
        return Ok(json!({
            "mode": "single_photo",
            "post_id": post_id,
            "url": format!("https://www.facebook.com/{post_id}")
        }));
    }

    // Trường hợp 5: Đăng Album nhiều ảnh cùng lúc (published=false -> attached_media)
    let mut media_fbids = Vec::new();
    for img in images {
        let bytes = download_drive_file_bytes(http, pool, &img.gdrive_file_id).await?;
        let part = Part::bytes(bytes.to_vec())
            .file_name(img.name.clone())
            .mime_str(&img.mime_type)
            .map_err(|e| format!("MIME ảnh không hợp lệ: {e}"))?;

        let form = Form::new()
            .text("published", "false")
            .text("access_token", token.clone())
            .part("source", part);

        let upload_resp: Value = http
            .post(format!("{FB_GRAPH_BASE}/{page_id}/photos"))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Lỗi upload ảnh nháp lên Facebook: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Lỗi đọc ID ảnh nháp Facebook: {e}"))?;

        if let Some(err) = upload_resp.get("error") {
            return Err(format!("Lỗi upload ảnh thành phần trong album: {err}"));
        }
        if let Some(id_str) = upload_resp["id"].as_str() {
            media_fbids.push(json!({ "media_fbid": id_str }));
        }
    }

    let feed_payload = json!({
        "message": caption,
        "attached_media": media_fbids,
        "access_token": token
    });

    let album_resp: Value = http
        .post(format!("{FB_GRAPH_BASE}/{page_id}/feed"))
        .json(&feed_payload)
        .send()
        .await
        .map_err(|e| format!("Lỗi xuất bản album nhiều ảnh lên Fanpage: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả album Fanpage: {e}"))?;

    if let Some(err) = album_resp.get("error") {
        return Err(format!("Facebook từ chối album ảnh: {err}"));
    }

    let post_id = album_resp["id"].as_str().unwrap_or_default();
    Ok(json!({
        "mode": "multi_photo_album",
        "photo_count": media_fbids.len(),
        "post_id": post_id,
        "url": format!("https://www.facebook.com/{post_id}")
    }))
}
