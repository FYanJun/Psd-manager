use crate::encrypted_backup::{create_backup, open_backup};
use crate::settings::{merge_portable_settings, portable_settings_content};
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct BackupPreview {
    vault: String,
    settings: Option<String>,
}

// These commands only transform validated in-memory content. All file access
// remains restricted to the paths selected in the native file dialogs.
#[tauri::command]
pub(crate) async fn create_encrypted_backup(
    vault_content: String,
    settings_content: Option<String>,
    password: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings_content
            .as_deref()
            .map(portable_settings_content)
            .transpose()?;
        create_backup(&vault_content, settings.as_deref(), &password)
    })
    .await
    .map_err(|_| "加密备份任务未能完成".to_string())?
}

#[tauri::command]
pub(crate) async fn open_encrypted_backup(
    content: String,
    password: String,
) -> Result<BackupPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let decoded = open_backup(&content, &password)?;
        Ok(BackupPreview {
            vault: decoded.vault,
            settings: decoded.settings,
        })
    })
    .await
    .map_err(|_| "备份读取任务未能完成".to_string())?
}

#[tauri::command]
pub(crate) async fn merge_backup_settings(
    current: String,
    imported: String,
) -> Result<String, String> {
    merge_portable_settings(&current, &imported)
}
