use crate::facebook::publish_to_facebook_page;
use crate::models::{MediaFile, ScheduledPost};
use crate::tiktok::publish_to_tiktok;
use reqwest::Client;
use serde_json::{json, Map, Value};
use sqlx::PgPool;
use uuid::Uuid;

/// Thực thi xuất bản 1 bài đăng lên toàn bộ các kênh được chọn (Facebook Feed, Facebook Reels, TikTok Direct, TikTok Inbox)
/// Sử dụng khóa trạng thái nguyên tử (`status != 'publishing'`) để chống đăng trùng lặp khi Cron chạy song song.
pub async fn publish_single_post(
    http: &Client,
    pool: &PgPool,
    post_id: Uuid,
) -> Result<ScheduledPost, String> {
    let locked_post = sqlx::query_as::<_, ScheduledPost>(
        "UPDATE public.scheduled_posts
         SET status = 'publishing', error_message = NULL, updated_at = now()
         WHERE id = $1 AND status != 'publishing'
         RETURNING *",
    )
    .bind(post_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Lỗi khóa trạng thái bài đăng: {e}"))?
    .ok_or_else(|| "Bài đăng không tồn tại hoặc đang trong tiến trình xuất bản khác".to_string())?;

    // Tải danh sách file đính kèm theo đúng thứ tự người dùng đã sắp xếp
    let media_list = if locked_post.media_ids.is_empty() {
        Vec::new()
    } else {
        let fetched = sqlx::query_as::<_, MediaFile>(
            "SELECT * FROM public.media_files WHERE id = ANY($1)",
        )
        .bind(&locked_post.media_ids)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Lỗi tải danh sách media đính kèm: {e}"))?;

        let mut ordered = Vec::with_capacity(fetched.len());
        for wanted_id in &locked_post.media_ids {
            if let Some(found) = fetched.iter().find(|m| &m.id == wanted_id) {
                ordered.push(found.clone());
            }
        }
        ordered
    };

    let mut results_map = Map::new();
    let mut errors = Vec::new();

    for platform in &locked_post.platforms {
        match platform.as_str() {
            "facebook_feed" => {
                match publish_to_facebook_page(http, pool, &locked_post.caption, &media_list, false).await {
                    Ok(res) => {
                        results_map.insert("facebook_feed".to_string(), json!({ "ok": true, "data": res }));
                    }
                    Err(err) => {
                        errors.push(format!("[FB Feed] {err}"));
                        results_map.insert("facebook_feed".to_string(), json!({ "ok": false, "error": err }));
                    }
                }
            }
            "facebook_reels" => {
                match publish_to_facebook_page(http, pool, &locked_post.caption, &media_list, true).await {
                    Ok(res) => {
                        results_map.insert("facebook_reels".to_string(), json!({ "ok": true, "data": res }));
                    }
                    Err(err) => {
                        errors.push(format!("[FB Reels] {err}"));
                        results_map.insert("facebook_reels".to_string(), json!({ "ok": false, "error": err }));
                    }
                }
            }
            "tiktok_direct" => {
                match publish_to_tiktok(http, pool, &locked_post, &media_list, true).await {
                    Ok(res) => {
                        results_map.insert("tiktok_direct".to_string(), json!({ "ok": true, "data": res }));
                    }
                    Err(err) => {
                        errors.push(format!("[TikTok Đăng thẳng] {err}"));
                        results_map.insert("tiktok_direct".to_string(), json!({ "ok": false, "error": err }));
                    }
                }
            }
            "tiktok_inbox" => {
                match publish_to_tiktok(http, pool, &locked_post, &media_list, false).await {
                    Ok(res) => {
                        results_map.insert("tiktok_inbox".to_string(), json!({ "ok": true, "data": res }));
                    }
                    Err(err) => {
                        errors.push(format!("[TikTok Nháp Inbox] {err}"));
                        results_map.insert("tiktok_inbox".to_string(), json!({ "ok": false, "error": err }));
                    }
                }
            }
            other => {
                errors.push(format!("Nền tảng không hỗ trợ: {other}"));
            }
        }
    }

    let final_status = if errors.is_empty() { "published" } else { "failed" };
    let error_summary = if errors.is_empty() {
        None
    } else {
        Some(errors.join(" | "))
    };

    let updated = sqlx::query_as::<_, ScheduledPost>(
        "UPDATE public.scheduled_posts
         SET status = $1,
             published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END,
             publish_results = $2,
             error_message = $3,
             updated_at = now()
         WHERE id = $4
         RETURNING *",
    )
    .bind(final_status)
    .bind(Value::Object(results_map))
    .bind(error_summary)
    .bind(post_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Lỗi lưu kết quả đăng bài: {e}"))?;

    // Nếu đăng thành công, tự động đổi nhãn các file đính kèm sang 'used' (Đã đăng) để người còn lại nhìn vào biết ngay!
    if final_status == "published" && !locked_post.media_ids.is_empty() {
        let _ = sqlx::query(
            "UPDATE public.media_files SET stage = 'used', updated_at = now() WHERE id = ANY($1)",
        )
        .bind(&locked_post.media_ids)
        .execute(pool)
        .await;
    }

    Ok(updated)
}

/// Quét và đăng tất cả các bài đã đến giờ hẹn (`status = 'scheduled' AND scheduled_at <= now()`)
pub async fn process_due_scheduled_posts(http: &Client, pool: &PgPool) -> Result<Value, String> {
    let due_ids: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT id
         FROM public.scheduled_posts
         WHERE status = 'scheduled'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= now()
         ORDER BY scheduled_at ASC
         LIMIT 5",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Lỗi quét danh sách bài hẹn giờ: {e}"))?;

    let mut processed = Vec::new();
    for (post_id,) in due_ids {
        match publish_single_post(http, pool, post_id).await {
            Ok(post) => processed.push(json!({
                "id": post.id,
                "status": post.status,
                "error": post.error_message
            })),
            Err(err) => processed.push(json!({
                "id": post_id,
                "status": "error",
                "error": err
            })),
        }
    }

    Ok(json!({
        "processed_count": processed.len(),
        "items": processed
    }))
}
