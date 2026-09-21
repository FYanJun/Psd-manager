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
    save_secure_vault_sync, vault_key_path, write_local_vault_key, write_password_lock_file,
    VaultSession, VAULT_IO_LOCK,
};
use crate::{installation_directory, open_directory, storage_info, ExitIntent, StorageInfo};
use std::{
    fs::{self, File},
    sync::atomic::Ordering,
};
use tauri::{AppHandle, Manager};

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
) -> Result<String, String> {
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
        let lock_path = password_lock_path(&app)?;
        write_password_lock_file(&app, &lock_file)?;
        let verified = unwrap_vault_key(&lock_file, &password)?;
        if verified != key {
            let _ = restore_private_file(&lock_path, None, "启动密码配置");
            return Err("启动密码配置校验失败".to_string());
        }
        let key_path = vault_key_path(&app)?;
        if key_path.exists() {
            if let Err(error) = fs::remove_file(&key_path) {
                let _ = restore_private_file(&lock_path, None, "启动密码配置");
                return Err(format!("无法移除本地资产库密钥，启动密码未启用：{error}"));
            }
            if let Err(error) = sync_parent_directory(&key_path) {
                let key_restore = restore_private_file(&key_path, Some(&key), "资产库密钥");
                let lock_cleanup = restore_private_file(&lock_path, None, "启动密码配置");
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
        format_recovery_file(&recovery_secret)
    })
    .await
    .map_err(|error| format!("设置启动密码任务失败：{error}"))?
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
) -> Result<String, String> {
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
        write_password_lock_file(&app, &new_lock_file)?;
        let verified_key = match unwrap_vault_key(&new_lock_file, &new_password) {
            Ok(verified_key) if verified_key == key => verified_key,
            _ => {
                let rollback =
                    restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
                return Err(format!(
                    "新启动密码配置校验失败{}",
                    rollback
                        .err()
                        .map(|error| format!("；恢复旧启动密码配置失败：{error}"))
                        .unwrap_or_default(),
                ));
            }
        };
        if verified_key != key {
            return Err("新启动密码配置校验失败".to_string());
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        format_recovery_file(&new_recovery_secret)
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
) -> Result<String, String> {
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
        write_password_lock_file(&app, &new_lock_file)?;
        let verified = match unwrap_vault_key(&new_lock_file, &new_password) {
            Ok(verified) if verified == key => verified,
            _ => {
                let rollback =
                    restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
                return Err(format!(
                    "新启动密码配置校验失败{}",
                    rollback
                        .err()
                        .map(|error| format!("；恢复旧启动密码配置失败：{error}"))
                        .unwrap_or_default(),
                ));
            }
        };
        if verified != key {
            return Err("新启动密码配置校验失败".to_string());
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        format_recovery_file(&recovery_secret)
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
        if let Err(error) = fs::remove_file(&lock_path) {
            if key_created {
                let _ = fs::remove_file(&key_path);
            }
            return Err(format!("无法关闭启动密码：{error}"));
        }
        if let Err(error) = sync_parent_directory(&lock_path) {
            let lock_restore =
                restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
            let key_cleanup = if key_created {
                fs::remove_file(&key_path)
                    .and_then(|_| {
                        #[cfg(unix)]
                        {
                            let directory = key_path
                                .parent()
                                .ok_or_else(|| std::io::Error::other("资产库路径缺少父目录"))?;
                            let directory_file = File::open(directory)?;
                            directory_file.sync_all()?;
                        }
                        Ok(())
                    })
                    .err()
            } else {
                None
            };
            return Err(format!(
                "无法同步启动密码配置，启动密码保持开启：{error}{}{}",
                lock_restore
                    .err()
                    .map(|restore_error| format!("；恢复启动密码配置失败：{restore_error}"))
                    .unwrap_or_default(),
                key_cleanup
                    .map(|cleanup_error| format!("；清理本地资产库密钥失败：{cleanup_error}"))
                    .unwrap_or_default(),
            ));
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
