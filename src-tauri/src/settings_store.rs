use crate::private_files::{
    replace_file_with_rollback, restrict_private_file, sync_parent_directory,
};
use crate::settings::validate_app_settings_content;
use crate::storage_paths::app_settings_path;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    sync::Mutex,
};
use tauri::AppHandle;

static APP_SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn load_app_settings_sync(app: &AppHandle) -> Result<Option<String>, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    restrict_private_file(&path, "应用设置")?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("无法读取应用设置：{error}"))?;
    validate_app_settings_content(&content)?;
    Ok(Some(content))
}

pub(crate) fn save_app_settings_sync(app: &AppHandle, content: String) -> Result<String, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    validate_app_settings_content(&content)?;
    let normalized = serde_json::to_string(&validate_app_settings_content(&content)?)
        .map_err(|error| format!("无法编码应用设置：{error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时应用设置：{error}"))?;
    restrict_private_file(&temporary_path, "临时应用设置")?;
    file.write_all(normalized.as_bytes())
        .map_err(|error| format!("无法写入应用设置：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步应用设置：{error}"))?;
    drop(file);
    replace_file_with_rollback(&temporary_path, &path, "应用设置")?;
    restrict_private_file(&path, "应用设置")?;
    let _ = sync_parent_directory(&path);
    Ok(normalized)
}

pub(crate) fn reset_app_settings_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法删除应用设置：{error}"))?;
        sync_parent_directory(&path)?;
    }
    Ok(())
}
