use crate::key_wrap::{unwrap_vault_key, unwrap_vault_key_with_recovery, wrap_vault_key};
use crate::private_files::{restore_private_file, sync_parent_directory};
use crate::recovery_format::{format_recovery_file, parse_recovery_file};
use crate::settings_store::{
    load_app_settings_sync, reset_app_settings_sync, save_app_settings_sync,
};
use crate::storage_paths::{data_container_directory, vault_paths};
use crate::vault_store::{
    get_or_create_local_vault_key, load_secure_vault_sync, lock_vault_file, password_lock_path,
    read_local_vault_key, read_password_lock_file, recover_vault_backup_sync,
    remove_password_lock_file, save_secure_vault_sync, vault_key_path, write_local_vault_key,
    write_password_lock_file, VaultSession, VAULT_IO_LOCK,
};
use crate::{installation_directory, open_directory, storage_info, ExitIntent, StorageInfo};
use serde::Serialize;
use std::{fs, sync::atomic::Ordering};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PasswordUpdateResult {
    recovery_file: String,
    cleanup_warning: Option<String>,
}

#[tauri::command]
pub(crate) async fn load_secure_vault(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || load_secure_vault_sync(&app))
        .await
        .map_err(|error| format!("资产库读取任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn save_secure_vault(
    app: AppHandle,
    content: String,
    expected_revision: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_secure_vault_sync(&app, content, expected_revision)
    })
    .await
    .map_err(|error| format!("资产库保存任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn get_vault_lock_status(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(read_password_lock_file(&app)?.is_some()))
        .await
        .map_err(|error| format!("启动密码状态读取任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn setup_vault_password(
    app: AppHandle,
    password: String,
) -> Result<PasswordUpdateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        if read_password_lock_file(&app)?.is_some() {
            return Err("启动密码已经设置".to_string());
        }
        let (vault_path, backup_path) = vault_paths(&app)?;
        let vault_exists = vault_path.exists() || backup_path.exists();
        let key = get_or_create_local_vault_key(&app, vault_exists)?;
        let (lock_file, recovery_secret) = wrap_vault_key(&key, &password)?;
        let outcome = write_password_lock_file(&app, &lock_file)?;
        let verified = unwrap_vault_key(&lock_file, &password)?;
        if verified != key {
            let _ = remove_password_lock_file(&app);
            return Err("启动密码配置校验失败".to_string());
        }
        let key_path = vault_key_path(&app)?;
        if key_path.exists() {
            if let Err(error) = fs::remove_file(&key_path) {
                let _ = remove_password_lock_file(&app);
                return Err(format!("无法移除本地资产库密钥，启动密码未启用：{error}"));
            }
            if let Err(error) = sync_parent_directory(&key_path) {
                let key_restore = restore_private_file(&key_path, Some(&key), "资产库密钥");
                let lock_cleanup = remove_password_lock_file(&app);
                return Err(format!(
                    "无法同步本地资产库密钥，启动密码未启用：{error}{}{}",
                    key_restore
                        .err()
                        .map(|restore_error| format!("；恢复本地资产库密钥失败：{restore_error}"))
                        .unwrap_or_default(),
                    lock_cleanup
                        .err()
                        .map(|cleanup_error| format!("；清理启动密码配置失败：{cleanup_error}"))
                        .unwrap_or_default(),
                ));
            }
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(PasswordUpdateResult {
            recovery_file: format_recovery_file(&recovery_secret)?,
            cleanup_warning: outcome.cleanup_warning,
        })
    })
    .await
    .map_err(|error| format!("设置启动密码任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn verify_vault_password(app: AppHandle, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let session = app.state::<VaultSession>();
        let session_guard = session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())?;
        let session_key = session_guard
            .as_ref()
            .ok_or_else(|| "资产库尚未解锁".to_string())?;
        let verified_key = unwrap_vault_key(&lock_file, &password)?;
        if verified_key != *session_key {
            return Err("主密码与当前资产库会话不匹配".to_string());
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("验证启动密码任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn unlock_vault(app: AppHandle, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let key = unwrap_vault_key(&lock_file, &password)?;
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(())
    })
    .await
    .map_err(|error| format!("解锁资产库任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn recover_vault_password(
    app: AppHandle,
    recovery_file: String,
    new_password: String,
) -> Result<PasswordUpdateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let lock_path = password_lock_path(&app)?;
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        let recovery_secret = parse_recovery_file(&recovery_file)?;
        let key = unwrap_vault_key_with_recovery(&lock_file, &recovery_secret)?;
        let (new_lock_file, new_recovery_secret) = wrap_vault_key(&key, &new_password)?;
        let outcome = write_password_lock_file(&app, &new_lock_file)?;
        verify_password_update(
            &new_lock_file,
            &new_password,
            &key,
            &lock_path,
            &old_lock_bytes,
        )?;
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(PasswordUpdateResult {
            recovery_file: format_recovery_file(&new_recovery_secret)?,
            cleanup_warning: outcome.cleanup_warning,
        })
    })
    .await
    .map_err(|error| format!("恢复启动密码任务失败：{error}"))?
}

#[tauri::command]
pub(crate) fn lock_vault(state: tauri::State<'_, VaultSession>) -> Result<(), String> {
    *state
        .0
        .lock()
        .map_err(|_| "资产库解锁状态已损坏".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub(crate) async fn change_vault_password(
    app: AppHandle,
    current_password: String,
    new_password: String,
) -> Result<PasswordUpdateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let old_lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let lock_path = password_lock_path(&app)?;
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        let key = unwrap_vault_key(&old_lock_file, &current_password)?;
        let (new_lock_file, recovery_secret) = wrap_vault_key(&key, &new_password)?;
        let outcome = write_password_lock_file(&app, &new_lock_file)?;
        verify_password_update(
            &new_lock_file,
            &new_password,
            &key,
            &lock_path,
            &old_lock_bytes,
        )?;
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(PasswordUpdateResult {
            recovery_file: format_recovery_file(&recovery_secret)?,
            cleanup_warning: outcome.cleanup_warning,
        })
    })
    .await
    .map_err(|error| format!("修改启动密码任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn disable_vault_password(app: AppHandle, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let key = unwrap_vault_key(&lock_file, &password)?;
        let key_path = vault_key_path(&app)?;
        let key_created = !key_path.exists();
        if key_created {
            write_local_vault_key(&app, &key)?;
        } else if read_local_vault_key(&app)?.as_deref() != Some(key.as_slice()) {
            return Err("本地资产库密钥与启动密码配置不一致，拒绝关闭启动密码".to_string());
        }
        let lock_path = password_lock_path(&app)?;
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        if let Err(error) =
            remove_password_lock_file(&app).and_then(|_| sync_parent_directory(&lock_path))
        {
            let rollback =
                rollback_password_disable(&lock_path, &key_path, key_created, &old_lock_bytes);
            return Err(format!("关闭启动密码未能完整完成：{error}{rollback}"));
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(())
    })
    .await
    .map_err(|error| format!("关闭启动密码任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn recover_vault_backup(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || recover_vault_backup_sync(&app))
        .await
        .map_err(|error| format!("资产库安全备份恢复任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn load_app_settings(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || load_app_settings_sync(&app))
        .await
        .map_err(|error| format!("应用设置读取任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn save_app_settings(app: AppHandle, content: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || save_app_settings_sync(&app, content))
        .await
        .map_err(|error| format!("应用设置保存任务失败：{error}"))?
}

#[tauri::command]
pub(crate) async fn reset_app_settings(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reset_app_settings_sync(&app))
        .await
        .map_err(|error| format!("应用设置重置任务失败：{error}"))?
}

#[tauri::command]
pub(crate) fn get_storage_info(app: AppHandle) -> Result<StorageInfo, String> {
    storage_info(&app)
}

#[tauri::command]
pub(crate) fn open_storage_path(app: AppHandle, kind: String) -> Result<(), String> {
    let path = match kind.as_str() {
        "installation" => installation_directory()?,
        "app-data" => data_container_directory(&app)?,
        _ => return Err("不支持的目录类型".to_string()),
    };
    open_directory(&path)
}

#[tauri::command]
pub(crate) fn exit_application(app: AppHandle) {
    app.state::<ExitIntent>().0.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn verify_password_update(
    lock_file: &crate::key_wrap::PasswordLockFile,
    password: &str,
    expected_key: &[u8],
    lock_path: &std::path::Path,
    old_lock_bytes: &[u8],
) -> Result<(), String> {
    match unwrap_vault_key(lock_file, password) {
        Ok(verified) if verified == expected_key => Ok(()),
        _ => {
            let rollback = restore_private_file(lock_path, Some(old_lock_bytes), "启动密码配置");
            Err(format!(
                "新启动密码配置校验失败{}",
                rollback
                    .err()
                    .map(|error| format!("；恢复旧启动密码配置失败：{error}"))
                    .unwrap_or_default(),
            ))
        }
    }
}

// Never remove the fallback key unless the old password wrapper has actually
// been restored. A failed directory sync can occur after its file was deleted.
fn rollback_password_disable(
    lock_path: &std::path::Path,
    key_path: &std::path::Path,
    key_created: bool,
    old_lock_bytes: &[u8],
) -> String {
    if let Err(error) = restore_private_file(lock_path, Some(old_lock_bytes), "启动密码配置")
    {
        return format!("；恢复启动密码配置失败：{error}；已保留本地资产库密钥，请勿删除");
    }
    if key_created {
        if let Err(error) = fs::remove_file(key_path)
            .map_err(|e| e.to_string())
            .and_then(|_| sync_parent_directory(key_path))
        {
            return format!("；启动密码配置已恢复，但本地资产库密钥清理失败：{error}");
        }
    }
    "；启动密码配置已恢复".to_string()
}

#[cfg(test)]
mod password_disable_rollback_tests {
    use super::*;
    #[test]
    fn failed_wrapper_restore_keeps_the_only_remaining_key() {
        let directory = std::env::temp_dir().join(format!(
            "psd-disable-rollback-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let key_path = directory.join("vault.key");
        fs::write(&key_path, [7; 32]).unwrap();
        let missing_parent_lock = directory.join("missing").join("vault.lock.json");
        let error =
            rollback_password_disable(&missing_parent_lock, &key_path, true, b"fictional-wrapper");
        assert!(error.contains("已保留"));
        assert_eq!(fs::read(&key_path).unwrap(), [7; 32]);
        let lock_path = directory.join("vault.lock.json");
        rollback_password_disable(&lock_path, &key_path, true, b"fictional-wrapper");
        assert_eq!(fs::read(&lock_path).unwrap(), b"fictional-wrapper");
        assert!(!key_path.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(test)]
mod password_update_verification_tests {
    use super::*;
    use std::path::PathBuf;

    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-password-update-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn matching_password_wrapper_keeps_the_committed_file() {
        let dir = Scratch::new();
        let path = dir.0.join("vault.lock.json");
        let key = [42; 32];
        let (wrapper, _) = wrap_vault_key(&key, "fictional-new-password").unwrap();
        let committed = serde_json::to_vec(&wrapper).unwrap();
        fs::write(&path, &committed).unwrap();
        verify_password_update(
            &wrapper,
            "fictional-new-password",
            &key,
            &path,
            b"former-wrapper",
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), committed);
    }

    #[test]
    fn incorrect_password_or_mismatched_key_restores_the_former_wrapper() {
        let dir = Scratch::new();
        let path = dir.0.join("vault.lock.json");
        let key = [42; 32];
        let (wrapper, _) = wrap_vault_key(&key, "fictional-new-password").unwrap();
        for (password, expected_key) in [
            ("fictional-wrong-password", key),
            ("fictional-new-password", [43; 32]),
        ] {
            fs::write(&path, serde_json::to_vec(&wrapper).unwrap()).unwrap();
            let error =
                verify_password_update(&wrapper, password, &expected_key, &path, b"former-wrapper")
                    .unwrap_err();
            assert_eq!(error, "新启动密码配置校验失败");
            assert_eq!(fs::read(&path).unwrap(), b"former-wrapper");
        }
    }

    #[test]
    fn failed_restore_reports_its_error_and_preserves_other_files() {
        let dir = Scratch::new();
        let key = [42; 32];
        let (wrapper, _) = wrap_vault_key(&key, "fictional-new-password").unwrap();
        let retained = dir.0.join("retained-wrapper");
        fs::write(&retained, b"former-wrapper").unwrap();
        let missing_parent = dir.0.join("missing").join("vault.lock.json");
        let error = verify_password_update(
            &wrapper,
            "fictional-wrong-password",
            &key,
            &missing_parent,
            b"former-wrapper",
        )
        .unwrap_err();
        assert!(error.starts_with("新启动密码配置校验失败；恢复旧启动密码配置失败："));
        assert_eq!(fs::read(&retained).unwrap(), b"former-wrapper");
        assert!(!missing_parent.exists());
    }
}
