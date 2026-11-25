use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WorkspaceMember {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub avatar_color: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Folder {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub color: String,
    pub stage: String,
    pub note: String,
    pub gdrive_folder_id: Option<String>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateFolderInput {
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub color: Option<String>,
    pub stage: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateFolderInput {
    pub name: Option<String>,
    pub color: Option<String>,
    pub stage: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MediaFile {
    pub id: Uuid,
    pub folder_id: Option<Uuid>,
    pub name: String,
    pub mime_type: String,
    pub media_kind: String,
    pub size_bytes: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration_sec: Option<f64>,
    pub thumbnail_url: Option<String>,
    pub gdrive_file_id: String,
    pub gdrive_web_link: Option<String>,
    pub stage: String,
    pub quick_note: String,
    pub tags: Vec<String>,
    pub uploaded_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InitDriveUploadInput {
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub folder_id: Option<Uuid>,
    pub origin: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InitDriveUploadOutput {
    pub upload_url: String,
    pub target_gdrive_folder_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterMediaInput {
    pub folder_id: Option<Uuid>,
    pub name: String,
    pub mime_type: String,
    pub media_kind: String,
    pub size_bytes: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration_sec: Option<f64>,
    pub thumbnail_url: Option<String>,
    pub gdrive_file_id: String,
    pub gdrive_web_link: Option<String>,
    pub stage: Option<String>,
    pub quick_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SocialChannel {
    pub id: Uuid,
    pub provider: String,
    pub account_id: String,
    pub account_name: String,
    pub avatar_url: Option<String>,
    #[serde(skip_serializing)]
    pub access_token: String,
    #[serde(skip_serializing)]
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub extra_config: Value,
    pub connected_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ScheduledPost {
    pub id: Uuid,
    pub title: String,
    pub caption: String,
    pub platforms: Vec<String>,
    pub media_ids: Vec<Uuid>,
    pub status: String,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub tiktok_privacy_level: String,
    pub tiktok_disable_comment: bool,
    pub tiktok_disable_duet: bool,
    pub tiktok_disable_stitch: bool,
    pub publish_results: Value,
    pub error_message: Option<String>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePostInput {
    pub title: Option<String>,
    pub caption: String,
    pub platforms: Vec<String>,
    pub media_ids: Vec<Uuid>,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub publish_now: Option<bool>,
    pub tiktok_privacy_level: Option<String>,
    pub tiktok_disable_comment: Option<bool>,
    pub tiktok_disable_duet: Option<bool>,
    pub tiktok_disable_stitch: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectFacebookManualInput {
    pub page_id: String,
    pub page_name: String,
    pub page_access_token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OAuthExchangeInput {
    pub code: String,
    pub redirect_uri: String,
}
