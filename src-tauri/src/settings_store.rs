use crate::private_files::{
    replace_file_with_rollback, restrict_private_file, sync_parent_directory,
};
use crate::settings::{
    default_local_state, join_settings_content, normalize_preferences_content,
    split_settings_content, validate_local_state_content,
};
use crate::storage_paths::app_settings_path;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::Mutex,
};
use tauri::AppHandle;

static APP_SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn load_app_settings_sync(app: &AppHandle) -> Result<Option<String>, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    load_settings_files(&app_settings_path(app)?)
}

pub(crate) fn save_app_settings_sync(app: &AppHandle, content: String) -> Result<String, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    save_settings_files(&app_settings_path(app)?, &content)
}

pub(crate) fn reset_app_settings_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    reset_settings_files(&app_settings_path(app)?)
}

fn reset_settings_files(path: &Path) -> Result<(), String> {
    // Remove recovery points before either formal document. A cleanup error
    // therefore cannot leave a missing settings.json with an old .bak that a
    // later read would resurrect. Preferences are the final deletion.
    let state_path = path.with_file_name("state.json");
    for document in [path, state_path.as_path()] {
        let name = document.file_name().unwrap().to_string_lossy();
        let rollback_prefix = format!(".{name}.replace-backup-");
        for entry in fs::read_dir(document.parent().unwrap())
            .map_err(|error| format!("无法检查应用设置：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法读取应用设置目录：{error}"))?;
            let candidate = entry.file_name().to_string_lossy().into_owned();
            if candidate == format!("{name}.bak")
                || candidate == format!("{name}.tmp")
                || candidate.starts_with(&rollback_prefix)
            {
                fs::remove_file(entry.path())
                    .map_err(|error| format!("无法删除应用设置恢复文件：{error}"))?;
            }
        }
    }
    for document in [state_path.as_path(), path] {
        if document.exists() {
            fs::remove_file(document).map_err(|error| format!("无法删除应用设置：{error}"))?;
        }
    }
    sync_parent_directory(path)
}

fn read_text(path: &Path, label: &str) -> Result<String, String> {
    restrict_private_file(path, label)?;
    fs::read_to_string(path).map_err(|error| format!("无法读取{label}：{error}"))
}

fn preferences_document(content: &str) -> Result<String, String> {
    // Validation preserves the full legacy representation until the coordinated
    // two-file migration has durably written its machine state.
    let (preferences, legacy_state) = normalize_preferences_content(content)?;
    match legacy_state {
        Some(state) => join_settings_content(&preferences, &state),
        None => Ok(preferences),
    }
}

fn write_document(path: &Path, content: &str, suffix: &str) -> Result<(), String> {
    let temporary_path = path.with_file_name(format!(
        "{}.{suffix}",
        path.file_name().unwrap().to_string_lossy()
    ));
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时设置文件：{error}"))?;
    restrict_private_file(&temporary_path, "临时设置")?;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("无法写入设置文件：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步设置文件：{error}"))?;
    drop(file);
    replace_file_with_rollback(&temporary_path, path, "设置文件")?;
    restrict_private_file(path, "设置文件")?;
    let _ = sync_parent_directory(path);
    Ok(())
}

fn read_or_recover_document(
    path: &Path,
    validate: fn(&str) -> Result<String, String>,
) -> Result<Option<String>, String> {
    if path.exists() {
        return validate(&read_text(path, "设置文件")?).map(Some);
    }
    let name = path.file_name().unwrap().to_string_lossy();
    let rollback_prefix = format!(".{name}.replace-backup-");
    let mut rollback_content = None;
    let mut interrupted = false;
    for entry in fs::read_dir(path.parent().unwrap())
        .map_err(|error| format!("无法检查设置恢复文件：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取设置恢复文件：{error}"))?;
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with(&rollback_prefix)
        {
            continue;
        }
        interrupted = true;
        if let Ok(content) =
            read_text(&entry.path(), "设置恢复文件").and_then(|content| validate(&content))
        {
            if rollback_content
                .as_ref()
                .is_some_and(|previous| previous != &content)
            {
                return Err(format!(
                    "发现多个内容不同的设置恢复文件，请先检查 {}",
                    path.display()
                ));
            }
            rollback_content = Some(content);
        }
    }
    let backup = path.with_file_name(format!("{name}.bak"));
    let content = match rollback_content {
        Some(content) => Some(content),
        None if backup.exists() => Some(validate(&read_text(&backup, "设置安全备份")?)?),
        None => None,
    };
    if let Some(content) = content {
        // Keep all candidates intact until the validated committed copy is back
        // at its normal path; never promote an uncommitted temporary file.
        write_document(path, &content, "recover-tmp")?;
        return Ok(Some(content));
    }
    if interrupted || path.with_file_name(format!("{name}.tmp")).exists() {
        return Err(format!(
            "发现未完成的设置写入，但没有可验证的已保存副本：{}",
            path.display()
        ));
    }
    Ok(None)
}

fn load_settings_files(path: &Path) -> Result<Option<String>, String> {
    let Some(content) = read_or_recover_document(path, preferences_document)? else {
        return Ok(None);
    };
    let (preferences, legacy_state) = normalize_preferences_content(&content)?;
    if let Some(legacy_state) = legacy_state {
        let full = join_settings_content(&preferences, &legacy_state)?;
        // State is written first. A crash before the preferences replacement
        // leaves the validated former full document as the migration source.
        return save_settings_files(path, &full).map(Some);
    }
    let state_path = path.with_file_name("state.json");
    let state = read_or_recover_document(&state_path, validate_local_state_content)?
        .unwrap_or_else(|| default_local_state().to_string());
    join_settings_content(&preferences, &state).map(Some)
}

fn save_settings_files(path: &Path, content: &str) -> Result<String, String> {
    let (preferences, state) = split_settings_content(content)?;
    // Preflight both current documents before mutation. A malformed primary is
    // reported explicitly rather than overwritten with in-memory defaults.
    let previous_preferences = read_or_recover_document(path, preferences_document)?
        .map(|content| normalize_preferences_content(&content).map(|(preferences, _)| preferences))
        .transpose()?;
    let state_path = path.with_file_name("state.json");
    let previous_state = read_or_recover_document(&state_path, validate_local_state_content)?;
    if previous_state.as_deref() != Some(state.as_str()) {
        if let Some(previous) = previous_state {
            write_document(
                &state_path.with_file_name("state.json.bak"),
                &previous,
                "tmp",
            )?;
        }
        write_document(&state_path, &state, "tmp")?;
    }
    if previous_preferences.as_deref() != Some(preferences.as_str()) || {
        let raw = read_text(path, "应用偏好").ok();
        raw.as_deref() != Some(preferences.as_str())
    } {
        if let Some(previous) = previous_preferences {
            write_document(&path.with_file_name("settings.json.bak"), &previous, "tmp")?;
        }
        write_document(path, &preferences, "tmp")?;
    }
    join_settings_content(&preferences, &state)
}

#[cfg(test)]
mod settings_store_tests {
    use super::*;
    use serde_json::{json, Value};
    use std::path::PathBuf;

    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-settings-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn settings_path(&self) -> PathBuf {
            self.0.join("settings.json")
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn settings(theme: &str) -> Value {
        json!({
            "interface":{"tooltipEnabled":true,"theme":theme,"startOnBoot":false,"startupLock":false,"autoLockMinutes":0},
            "workspace":{"rememberLayout":true,"paneLayout":{"sidebarRatio":0.15,"listRatio":0.25,"generatorRatio":0.32},"deviceSortMode":"updatedDesc","deviceTypeSortMode":"default","rememberLastView":true,"rememberWindowBounds":true,"windowBounds":{"x":20,"y":40,"width":1200,"height":800},"lastView":{"deviceType":"私有设备","searchQuery":"sensitive-search","sortMode":"nameAsc","selectedDeviceUuid":"00000000-0000-4000-8000-000000000001"}},
            "passwordGenerator":{"length":8,"useUpper":true,"useLower":true,"useNumbers":true,"useSymbols":true,"excludeSimilar":true,"preventRepeats":false,"minimumNumbers":2,"minimumSymbols":2,"allowedSymbols":"!@","excludedCharacters":""}
        })
    }
    #[test]
    fn save_splits_local_state_and_retains_previous_valid_preferences() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        save_settings_files(&path, &settings("light").to_string()).unwrap();
        save_settings_files(&path, &settings("dark").to_string()).unwrap();
        let preferences: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(preferences["workspace"].get("windowBounds").is_none());
        assert!(preferences["workspace"].get("lastView").is_none());
        let state = fs::read_to_string(dir.0.join("state.json")).unwrap();
        assert!(!state.contains("sensitive-search"));
        assert!(!state.contains("私有设备"));
        let backup: Value =
            serde_json::from_slice(&fs::read(path.with_extension("json.bak")).unwrap()).unwrap();
        assert_eq!(backup["interface"]["theme"], "light");
        let loaded: Value =
            serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
        assert_eq!(loaded["interface"]["theme"], "dark");
        assert_eq!(loaded["workspace"]["windowBounds"]["x"], 20);
        assert_eq!(loaded["workspace"]["lastView"]["searchQuery"], "");
    }
    #[test]
    fn interrupted_replacement_recovers_valid_committed_file_not_new_temp() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        fs::write(
            dir.0.join(".settings.json.replace-backup-123"),
            settings("light").to_string(),
        )
        .unwrap();
        fs::write(
            path.with_extension("json.tmp"),
            settings("dark").to_string(),
        )
        .unwrap();
        let loaded: Value =
            serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
        assert_eq!(loaded["interface"]["theme"], "light");
        assert!(path.exists());
    }
    #[test]
    fn corrupt_primary_never_silently_overwrites_or_loads_defaults() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        fs::write(&path, b"corrupt").unwrap();
        fs::write(
            path.with_extension("json.bak"),
            settings("light").to_string(),
        )
        .unwrap();
        assert!(load_settings_files(&path).is_err());
        assert!(save_settings_files(&path, &settings("dark").to_string()).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"corrupt");
    }
    #[test]
    fn legacy_full_settings_migrate_without_retaining_business_view() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        fs::write(&path, settings("dark").to_string()).unwrap();
        let loaded: Value =
            serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
        assert_eq!(loaded["workspace"]["windowBounds"]["height"], 800);
        for file in ["settings.json", "settings.json.bak", "state.json"] {
            let content = fs::read_to_string(dir.0.join(file)).unwrap();
            assert!(!content.contains("sensitive-search"));
            assert!(!content.contains("私有设备"));
        }
    }
    #[test]
    fn orphaned_temporary_settings_require_recovery_instead_of_defaults() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        fs::write(
            path.with_extension("json.tmp"),
            settings("dark").to_string(),
        )
        .unwrap();
        assert!(load_settings_files(&path).is_err());
        assert!(!path.exists());
    }
    #[test]
    fn ambiguous_committed_recovery_files_are_preserved_and_reported() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        for (suffix, theme) in [("1", "light"), ("2", "dark")] {
            fs::write(
                dir.0
                    .join(format!(".settings.json.replace-backup-{suffix}")),
                settings(theme).to_string(),
            )
            .unwrap();
        }
        assert!(load_settings_files(&path).is_err());
        assert!(!path.exists());
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 2);
    }
    #[test]
    fn missing_primary_recovers_previous_valid_backup() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        save_settings_files(&path, &settings("light").to_string()).unwrap();
        save_settings_files(&path, &settings("dark").to_string()).unwrap();
        fs::remove_file(&path).unwrap();
        let loaded: Value =
            serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
        assert_eq!(loaded["interface"]["theme"], "light");
    }
    #[test]
    fn invalid_state_preflight_preserves_preferences_and_recovery_points() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        save_settings_files(&path, &settings("light").to_string()).unwrap();
        let before = fs::read(&path).unwrap();
        fs::write(dir.0.join("state.json"), b"bad-state").unwrap();
        assert!(save_settings_files(&path, &settings("dark").to_string()).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(!dir.0.join("settings.json.bak").exists());
        assert_eq!(fs::read(dir.0.join("state.json")).unwrap(), b"bad-state");
    }
    #[test]
    fn save_and_reload_preserve_sort_when_last_view_is_scrubbed() {
        for mode in ["nameAsc", "typeAsc"] {
            let dir = Scratch::new();
            let path = dir.settings_path();
            let mut content = settings("dark");
            content["workspace"]["deviceSortMode"] = json!(mode);
            let saved: Value =
                serde_json::from_str(&save_settings_files(&path, &content.to_string()).unwrap())
                    .unwrap();
            let loaded: Value =
                serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
            for value in [saved, loaded] {
                assert_eq!(value["workspace"]["deviceSortMode"], mode);
                assert_eq!(value["workspace"]["lastView"]["sortMode"], mode);
                assert_eq!(value["workspace"]["lastView"]["searchQuery"], "");
            }
        }
    }

    #[test]
    fn reset_removes_recovery_points_before_preferences_and_never_resurrects_them() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        save_settings_files(&path, &settings("light").to_string()).unwrap();
        save_settings_files(&path, &settings("dark").to_string()).unwrap();
        fs::write(
            dir.0.join(".settings.json.replace-backup-123"),
            settings("light").to_string(),
        )
        .unwrap();
        fs::write(dir.0.join("settings.json.tmp"), "unfinished").unwrap();
        reset_settings_files(&path).unwrap();
        assert!(load_settings_files(&path).unwrap().is_none());
        assert!(!dir.0.join("state.json").exists());
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 0);
    }
    #[test]
    fn failed_reset_cleanup_keeps_formal_preferences_readable() {
        let dir = Scratch::new();
        let path = dir.settings_path();
        save_settings_files(&path, &settings("dark").to_string()).unwrap();
        // A directory at an exact recovery-file path makes remove_file fail
        // deterministically on both Unix and Windows, without permission tricks.
        fs::create_dir(dir.0.join("settings.json.bak")).unwrap();
        let before = fs::read(&path).unwrap();
        assert!(reset_settings_files(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        let loaded: Value =
            serde_json::from_str(&load_settings_files(&path).unwrap().unwrap()).unwrap();
        assert_eq!(loaded["interface"]["theme"], "dark");
    }
}
