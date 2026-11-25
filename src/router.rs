use crate::auth::{authenticate_member, verify_cron_secret};
use crate::db::get_db_pool;
use crate::facebook::{connect_facebook_manual, connect_facebook_oauth};
use crate::gdrive::{
    connect_google_drive, ensure_drive_folder, get_valid_drive_channel, init_resumable_upload,
};
use crate::models::{
    ConnectFacebookManualInput, CreateFolderInput, CreatePostInput, Folder, InitDriveUploadInput,
    MediaFile, OAuthExchangeInput, RegisterMediaInput, ScheduledPost, SocialChannel,
    UpdateFolderInput,
};
use crate::publisher::{process_due_scheduled_posts, publish_single_post};
use crate::tiktok::{connect_tiktok_oauth, fetch_creator_info_with_token, get_valid_tiktok_token};
use axum::extract::{Path, Query, Request, State};
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub http: Client,
}

impl AppState {
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(55))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { http }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

type ApiResult = Result<Response, Response>;

fn json_resp<T: serde::Serialize>(status: StatusCode, payload: T) -> Response {
    let mut resp = (status, Json(payload)).into_response();
    let headers = resp.headers_mut();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type".parse().unwrap(),
    );
    resp
}

fn err_resp(code: u16, msg: impl Into<String>) -> Response {
    let status = StatusCode::from_u16(code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    json_resp(status, json!({ "ok": false, "error": msg.into() }))
}

fn auth_header_str(headers: &HeaderMap) -> Option<&str> {
    headers.get("authorization").and_then(|v| v.to_str().ok())
}

#[derive(Debug, Deserialize)]
struct FilesQuery {
    folder_id: Option<Uuid>,
    stage: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateFileInput {
    stage: Option<String>,
    quick_note: Option<String>,
    folder_id: Option<Uuid>,
}

/// Khởi tạo bộ định tuyến Axum xử lý toàn bộ `/api/rust/*` trên 1 Vercel Serverless Function duy nhất
pub fn build_router() -> Router {
    let state = Arc::new(AppState::new());

    let api_routes = Router::new()
        .route("/health", get(handle_health))
        .route("/folders", get(handle_list_folders).post(handle_create_folder))
        .route(
            "/folders/{id}",
            patch(handle_update_folder).delete(handle_delete_folder),
        )
        .route("/drive/init-upload", post(handle_init_drive_upload))
        .route("/files", get(handle_list_files).post(handle_register_file))
        .route(
            "/files/{id}",
            patch(handle_update_file).delete(handle_delete_file),
        )
        .route("/channels", get(handle_list_channels))
        .route("/channels/{id}", delete(handle_delete_channel))
        .route("/channels/google-drive/oauth", post(handle_connect_drive))
        .route("/channels/facebook/oauth", post(handle_connect_fb_oauth))
        .route("/channels/facebook/manual", post(handle_connect_fb_manual))
        .route("/channels/tiktok/oauth", post(handle_connect_tiktok_oauth))
        .route("/channels/tiktok/creator-info", get(handle_tiktok_creator_info))
        .route("/posts", get(handle_list_posts).post(handle_create_post))
        .route("/posts/{id}/publish", post(handle_publish_post_now))
        .route("/posts/{id}", delete(handle_delete_post))
        .route("/cron/publish", get(handle_cron_publish).post(handle_cron_publish))
        .fallback(handle_options_or_404);

    Router::new()
        .nest("/api/rust", api_routes.clone())
        .merge(api_routes)
        .layer(middleware::from_fn(normalize_vercel_rewrite_uri))
        .with_state(state)
}

/// Chuẩn hóa đường dẫn khi Vercel rewrite `/api/rust/:path*` -> `/api/backend?__route=/:path*`
/// Đảm bảo khớp 100% dù Vercel truyền URI gốc hay URI đích vào Serverless Function.
async fn normalize_vercel_rewrite_uri(mut req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    if path == "/api/backend" || path == "/api/backend/" {
        if let Some(raw_query) = req.uri().query() {
            let mut target_route: Option<String> = None;
            let mut kept_pairs: Vec<String> = Vec::new();

            for pair in raw_query.split('&') {
                if let Some(val) = pair.strip_prefix("__route=") {
                    let decoded = url::form_urlencoded::parse(format!("r={val}").as_bytes())
                        .next()
                        .map(|(_, v)| v.into_owned())
                        .unwrap_or_else(|| val.to_string());
                    target_route = Some(decoded);
                } else if !pair.is_empty() {
                    kept_pairs.push(pair.to_string());
                }
            }

            if let Some(route) = target_route {
                let clean_route = if route.starts_with('/') {
                    route
                } else {
                    format!("/{route}")
                };
                let new_path_and_query = if kept_pairs.is_empty() {
                    format!("/api/rust{clean_route}")
                } else {
                    format!("/api/rust{clean_route}?{}", kept_pairs.join("&"))
                };
                if let Ok(new_uri) = new_path_and_query.parse::<Uri>() {
                    *req.uri_mut() = new_uri;
                }
            }
        }
    }
    next.run(req).await
}

async fn handle_options_or_404(method: Method) -> Response {
    if method == Method::OPTIONS {
        return json_resp(StatusCode::NO_CONTENT, json!({}));
    }
    err_resp(404, "Không tìm thấy đường dẫn API Rust")
}

async fn handle_health() -> Response {
    json_resp(
        StatusCode::OK,
        json!({
            "ok": true,
            "service": "duoagency-rust-backend",
            "runtime": "vercel_rust_v2",
            "features": ["google_drive_resumable", "facebook_graph_v22", "tiktok_content_posting_v2", "auto_scheduler"]
        }),
    )
}

async fn handle_list_folders(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let folders = sqlx::query_as::<_, Folder>(
        "SELECT * FROM public.folders ORDER BY updated_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi tải danh sách folder: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": folders })))
}

async fn handle_create_folder(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<CreateFolderInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    if input.name.trim().is_empty() {
        return Err(err_resp(400, "Tên thư mục không được để trống"));
    }

    // Nếu đã kết nối Google Drive, tự động tạo thư mục tương ứng trên Drive để đồng bộ kho 15GB
    let mut gdrive_folder_id: Option<String> = None;
    if let Ok((drive_token, root_drive_id)) = get_valid_drive_channel(&state.http, pool).await {
        let mut parent_drive = root_drive_id;
        if let Some(parent_uuid) = input.parent_id {
            if let Ok(Some((Some(pfid),))) = sqlx::query_as::<_, (Option<String>,)>(
                "SELECT gdrive_folder_id FROM public.folders WHERE id = $1",
            )
            .bind(parent_uuid)
            .fetch_optional(pool)
            .await
            {
                parent_drive = Some(pfid);
            }
        }
        if let Ok(created_drive_id) = ensure_drive_folder(
            &state.http,
            &drive_token,
            input.name.trim(),
            parent_drive.as_deref(),
        )
        .await
        {
            gdrive_folder_id = Some(created_drive_id);
        }
    }

    let folder = sqlx::query_as::<_, Folder>(
        "INSERT INTO public.folders (parent_id, name, color, stage, note, gdrive_folder_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(input.parent_id)
    .bind(input.name.trim())
    .bind(input.color.unwrap_or_else(|| "#6366f1".to_string()))
    .bind(input.stage.unwrap_or_else(|| "raw".to_string()))
    .bind(input.note.unwrap_or_default())
    .bind(gdrive_folder_id)
    .bind(&member.email)
    .fetch_one(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi tạo folder: {e}")))?;

    Ok(json_resp(StatusCode::CREATED, json!({ "ok": true, "data": folder })))
}

async fn handle_update_folder(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateFolderInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let folder = sqlx::query_as::<_, Folder>(
        "UPDATE public.folders
         SET name = COALESCE($1, name),
             color = COALESCE($2, color),
             stage = COALESCE($3, stage),
             note = COALESCE($4, note),
             updated_at = now()
         WHERE id = $5
         RETURNING *",
    )
    .bind(input.name)
    .bind(input.color)
    .bind(input.stage)
    .bind(input.note)
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi cập nhật folder: {e}")))?
    .ok_or_else(|| err_resp(404, "Không tìm thấy folder"))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": folder })))
}

async fn handle_delete_folder(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    sqlx::query("DELETE FROM public.folders WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| err_resp(500, format!("Lỗi xóa folder: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true })))
}

async fn handle_init_drive_upload(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut input): Json<InitDriveUploadInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    if input.origin.is_none() {
        input.origin = headers
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .map(String::from);
    }

    let out = init_resumable_upload(&state.http, pool, &input)
        .await
        .map_err(|e| err_resp(400, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": out })))
}

async fn handle_list_files(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<FilesQuery>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let files = match (q.folder_id, q.stage) {
        (Some(fid), Some(st)) => {
            sqlx::query_as::<_, MediaFile>(
                "SELECT * FROM public.media_files WHERE folder_id = $1 AND stage = $2 ORDER BY created_at DESC",
            )
            .bind(fid)
            .bind(st)
            .fetch_all(pool)
            .await
        }
        (Some(fid), None) => {
            sqlx::query_as::<_, MediaFile>(
                "SELECT * FROM public.media_files WHERE folder_id = $1 ORDER BY created_at DESC",
            )
            .bind(fid)
            .fetch_all(pool)
            .await
        }
        (None, Some(st)) => {
            sqlx::query_as::<_, MediaFile>(
                "SELECT * FROM public.media_files WHERE stage = $1 ORDER BY created_at DESC",
            )
            .bind(st)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query_as::<_, MediaFile>(
                "SELECT * FROM public.media_files ORDER BY created_at DESC LIMIT 300",
            )
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|e| err_resp(500, format!("Lỗi tải danh sách file: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": files })))
}

async fn handle_register_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<RegisterMediaInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let file = sqlx::query_as::<_, MediaFile>(
        "INSERT INTO public.media_files
            (folder_id, name, mime_type, media_kind, size_bytes, width, height, duration_sec,
             thumbnail_url, gdrive_file_id, gdrive_web_link, stage, quick_note, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *",
    )
    .bind(input.folder_id)
    .bind(&input.name)
    .bind(&input.mime_type)
    .bind(&input.media_kind)
    .bind(input.size_bytes)
    .bind(input.width)
    .bind(input.height)
    .bind(input.duration_sec)
    .bind(input.thumbnail_url)
    .bind(&input.gdrive_file_id)
    .bind(input.gdrive_web_link)
    .bind(input.stage.unwrap_or_else(|| "raw".to_string()))
    .bind(input.quick_note.unwrap_or_default())
    .bind(&member.email)
    .fetch_one(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi lưu thông tin file: {e}")))?;

    Ok(json_resp(StatusCode::CREATED, json!({ "ok": true, "data": file })))
}

async fn handle_update_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateFileInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let updated = sqlx::query_as::<_, MediaFile>(
        "UPDATE public.media_files
         SET stage = COALESCE($1, stage),
             quick_note = COALESCE($2, quick_note),
             folder_id = COALESCE($3, folder_id),
             updated_at = now()
         WHERE id = $4
         RETURNING *",
    )
    .bind(input.stage)
    .bind(input.quick_note)
    .bind(input.folder_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi cập nhật file: {e}")))?
    .ok_or_else(|| err_resp(404, "Không tìm thấy file"))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": updated })))
}

async fn handle_delete_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    sqlx::query("DELETE FROM public.media_files WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| err_resp(500, format!("Lỗi xóa file: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true })))
}

async fn handle_list_channels(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let channels = sqlx::query_as::<_, SocialChannel>(
        "SELECT * FROM public.social_channels ORDER BY provider ASC, updated_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi tải danh sách kết nối: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": channels })))
}

async fn handle_delete_channel(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    sqlx::query("DELETE FROM public.social_channels WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| err_resp(500, format!("Lỗi ngắt kết nối kênh: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true })))
}

async fn handle_connect_drive(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<OAuthExchangeInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let ch = connect_google_drive(
        &state.http,
        pool,
        &input.code,
        &input.redirect_uri,
        &member.email,
    )
    .await
    .map_err(|e| err_resp(400, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": ch })))
}

async fn handle_connect_fb_oauth(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<OAuthExchangeInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let channels = connect_facebook_oauth(
        &state.http,
        pool,
        &input.code,
        &input.redirect_uri,
        &member.email,
    )
    .await
    .map_err(|e| err_resp(400, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": channels })))
}

async fn handle_connect_fb_manual(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<ConnectFacebookManualInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let ch = connect_facebook_manual(&state.http, pool, &input, &member.email)
        .await
        .map_err(|e| err_resp(400, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": ch })))
}

async fn handle_connect_tiktok_oauth(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<OAuthExchangeInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let ch = connect_tiktok_oauth(
        &state.http,
        pool,
        &input.code,
        &input.redirect_uri,
        &member.email,
    )
    .await
    .map_err(|e| err_resp(400, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": ch })))
}

async fn handle_tiktok_creator_info(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let token = get_valid_tiktok_token(&state.http, pool)
        .await
        .map_err(|e| err_resp(400, e))?;
    let info: Value = fetch_creator_info_with_token(&state.http, &token)
        .await
        .map_err(|e| err_resp(502, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": info["data"] })))
}

async fn handle_list_posts(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let posts = sqlx::query_as::<_, ScheduledPost>(
        "SELECT * FROM public.scheduled_posts ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 200",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi tải danh sách bài đăng: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": posts })))
}

async fn handle_create_post(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<CreatePostInput>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let member = authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    if input.platforms.is_empty() {
        return Err(err_resp(400, "Vui lòng chọn ít nhất 1 kênh đăng (Facebook hoặc TikTok)"));
    }

    let publish_now = input.publish_now.unwrap_or(false);
    let initial_status = if publish_now {
        "scheduled"
    } else if input.scheduled_at.is_some() {
        "scheduled"
    } else {
        "draft"
    };

    let created = sqlx::query_as::<_, ScheduledPost>(
        "INSERT INTO public.scheduled_posts
            (title, caption, platforms, media_ids, status, scheduled_at,
             tiktok_privacy_level, tiktok_disable_comment, tiktok_disable_duet, tiktok_disable_stitch, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *",
    )
    .bind(input.title.unwrap_or_default())
    .bind(&input.caption)
    .bind(&input.platforms)
    .bind(&input.media_ids)
    .bind(initial_status)
    .bind(input.scheduled_at)
    .bind(input.tiktok_privacy_level.unwrap_or_else(|| "PUBLIC_TO_EVERYONE".to_string()))
    .bind(input.tiktok_disable_comment.unwrap_or(false))
    .bind(input.tiktok_disable_duet.unwrap_or(false))
    .bind(input.tiktok_disable_stitch.unwrap_or(false))
    .bind(&member.email)
    .fetch_one(pool)
    .await
    .map_err(|e| err_resp(500, format!("Lỗi tạo bài đăng: {e}")))?;

    if publish_now {
        let published = publish_single_post(&state.http, pool, created.id)
            .await
            .map_err(|e| err_resp(502, e))?;
        return Ok(json_resp(StatusCode::CREATED, json!({ "ok": true, "data": published })));
    }

    Ok(json_resp(StatusCode::CREATED, json!({ "ok": true, "data": created })))
}

async fn handle_publish_post_now(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    let post = publish_single_post(&state.http, pool, id)
        .await
        .map_err(|e| err_resp(502, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": post })))
}

async fn handle_delete_post(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult {
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    authenticate_member(&state.http, pool, auth_header_str(&headers))
        .await
        .map_err(|(c, m)| err_resp(c, m))?;

    sqlx::query("DELETE FROM public.scheduled_posts WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| err_resp(500, format!("Lỗi xóa bài đăng: {e}")))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true })))
}

async fn handle_cron_publish(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> ApiResult {
    verify_cron_secret(auth_header_str(&headers)).map_err(|(c, m)| err_resp(c, m))?;
    let pool = get_db_pool().await.map_err(|e| err_resp(500, e))?;
    let summary = process_due_scheduled_posts(&state.http, pool)
        .await
        .map_err(|e| err_resp(500, e))?;

    Ok(json_resp(StatusCode::OK, json!({ "ok": true, "data": summary })))
}
