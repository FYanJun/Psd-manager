use aes_gcm::{
    aead::{Aead, Generate, Key, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

const VAULT_FILE_NAME: &str = "vault.enc.json";
const VAULT_BACKUP_FILE_NAME: &str = "vault.enc.backup.json";
const VAULT_LOCK_FILE_NAME: &str = "vault.lock";
const VAULT_KEY_FILE_NAME: &str = "vault.key";
const KEYRING_SERVICE: &str = "com.fan.psd-manager";
const KEYRING_ACCOUNT: &str = "vault-key-v1";
const VAULT_AAD: &[u8] = b"com.fan.psd-manager:vault:1";
const VAULT_SCHEMA_VERSION: u64 = 2;
const LEGACY_KEY_MIGRATION_REQUIRED: &str = "LEGACY_KEY_MIGRATION_REQUIRED";
const BACKUP_RECOVERY_REQUIRED: &str = "BACKUP_RECOVERY_REQUIRED";
static VAULT_IO_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
struct EncryptedVaultFile {
    version: u8,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum VaultSource {
    Primary,
    Backup,
}

fn vault_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok((
        directory.join(VAULT_FILE_NAME),
        directory.join(VAULT_BACKUP_FILE_NAME),
    ))
}

fn legacy_app_identifier() -> String {
    format!("com.fan.{}-{}-{}", "device", "password", "manager")
}

fn legacy_vault_aad() -> Vec<u8> {
    format!("{}:vault:1", legacy_app_identifier()).into_bytes()
}

fn migrate_legacy_data_directory(current: &Path) -> Result<(), String> {
    if current.exists() {
        return Ok(());
    }
    let parent = current
        .parent()
        .ok_or_else(|| "应用数据目录缺少父目录".to_string())?;
    let legacy = parent.join(legacy_app_identifier());
    if legacy.exists() {
        fs::rename(&legacy, current)
            .map_err(|error| format!("无法迁移旧版应用数据目录：{error}"))?;
    }
    Ok(())
}

fn ensure_vault_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    migrate_legacy_data_directory(&directory)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建资产库目录：{error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("无法限制资产库目录权限：{error}"))?;
    }
    Ok(directory)
}

fn lock_vault_file(app: &AppHandle) -> Result<File, String> {
    let directory = ensure_vault_directory(app)?;
    let mut options = OpenOptions::new();
    options.create(true).read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let lock_path = directory.join(VAULT_LOCK_FILE_NAME);
    let lock_file = options
        .open(&lock_path)
        .map_err(|error| format!("无法打开资产库进程锁：{error}"))?;
    restrict_private_file(&lock_path, "资产库进程锁")?;
    fs4::FileExt::lock(&lock_file).map_err(|error| format!("无法获取资产库进程锁：{error}"))?;
    Ok(lock_file)
}

fn vault_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(VAULT_KEY_FILE_NAME))
}

fn sync_parent_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        let directory = path
            .parent()
            .ok_or_else(|| "资产库路径缺少父目录".to_string())?;
        let directory_file = File::open(directory)
            .map_err(|error| format!("无法打开资产库目录进行同步：{error}"))?;
        directory_file
            .sync_all()
            .map_err(|error| format!("无法同步资产库目录：{error}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn restrict_private_file(path: &Path, description: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("无法限制{description}文件权限：{error}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = (path, description);
    }
    Ok(())
}

fn restrict_existing_vault_files(vault_path: &Path, backup_path: &Path) -> Result<(), String> {
    if vault_path.exists() {
        restrict_private_file(vault_path, "主资产库")?;
    }
    if backup_path.exists() {
        restrict_private_file(backup_path, "资产库安全备份")?;
    }
    Ok(())
}

fn read_local_vault_key(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
    let key_path = vault_key_path(app)?;
    if !key_path.exists() {
        return Ok(None);
    }
    restrict_private_file(&key_path, "资产库密钥")?;
    let key = fs::read(&key_path).map_err(|error| format!("无法读取本地资产库密钥：{error}"))?;
    if key.len() != 32 {
        return Err("本地资产库密钥长度不正确".to_string());
    }
    Ok(Some(key))
}

fn write_local_vault_key(app: &AppHandle, key: &[u8]) -> Result<(), String> {
    if key.len() != 32 {
        return Err("拒绝写入长度不正确的资产库密钥".to_string());
    }
    let key_path = vault_key_path(app)?;
    if key_path.exists() {
        return Err("本地资产库密钥已存在，拒绝覆盖".to_string());
    }
    let temporary_path = key_path.with_extension("key.tmp");
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时资产库密钥：{error}"))?;
    restrict_private_file(&temporary_path, "临时资产库密钥")?;
    file.write_all(key)
        .map_err(|error| format!("无法写入本地资产库密钥：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步本地资产库密钥：{error}"))?;
    drop(file);
    fs::rename(&temporary_path, &key_path)
        .map_err(|error| format!("无法启用本地资产库密钥：{error}"))?;
    sync_parent_directory(&key_path)?;
    Ok(())
}

fn get_or_create_local_vault_key(app: &AppHandle, vault_exists: bool) -> Result<Vec<u8>, String> {
    if let Some(key) = read_local_vault_key(app)? {
        return Ok(key);
    }
    if vault_exists {
        return Err(format!(
            "{LEGACY_KEY_MIGRATION_REQUIRED}:现有资产库仍使用旧版系统钥匙串密钥，请先迁移旧资产库"
        ));
    }
    let key = Key::<Aes256Gcm>::generate().to_vec();
    write_local_vault_key(app, &key)?;
    Ok(key)
}

fn validate_vault_payload(content: &str, allow_legacy: bool) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(content).map_err(|error| format!("资产库内容格式不正确：{error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "资产库内容必须是对象".to_string())?;
    match object.get("schemaVersion") {
        Some(version) if version.as_u64() == Some(VAULT_SCHEMA_VERSION) => {}
        Some(version) if allow_legacy && version.as_u64() == Some(1) => {}
        Some(version) => {
            return Err(format!(
                "不支持资产库数据版本 {}，当前仅支持 {VAULT_SCHEMA_VERSION}",
                version
            ))
        }
        None if allow_legacy => {}
        None => return Err("资产库内容缺少 schemaVersion".to_string()),
    }
    for key in ["items", "customDeviceTypes"] {
        if !object.get(key).is_some_and(Value::is_array) {
            return Err(format!("资产库字段 {key} 必须是数组"));
        }
    }
    if !allow_legacy || object.contains_key("schemaVersion") {
        if !object.get("snapshots").is_some_and(Value::is_array) {
            return Err("资产库字段 snapshots 必须是数组".to_string());
        }
        if !object.get("paneLayout").is_some_and(Value::is_object) {
            return Err("资产库字段 paneLayout 必须是对象".to_string());
        }
        if object.get("revision").and_then(Value::as_u64).is_none() {
            return Err("资产库字段 revision 必须是非负整数".to_string());
        }
    }
    Ok(value)
}

#[cfg(desktop)]
fn restore_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn vault_revision(value: &Value) -> u64 {
    value.get("revision").and_then(Value::as_u64).unwrap_or(0)
}

fn load_existing_vault(
    vault_path: &Path,
    backup_path: &Path,
    key: &[u8],
) -> Result<(Option<String>, Option<VaultSource>), String> {
    if vault_path.exists() {
        match decrypt_vault_file(vault_path, key) {
            Ok(content) => return Ok((Some(content), Some(VaultSource::Primary))),
            Err(primary_error) if backup_path.exists() => {
                return decrypt_vault_file(backup_path, key)
                    .map(|content| (Some(content), Some(VaultSource::Backup)))
                    .map_err(|backup_error| {
                        format!(
                            "主资产库无法读取：{primary_error}；安全备份也无法读取：{backup_error}"
                        )
                    });
            }
            Err(error) => return Err(error),
        }
    }
    if backup_path.exists() {
        return decrypt_vault_file(backup_path, key)
            .map(|content| (Some(content), Some(VaultSource::Backup)));
    }
    Ok((None, None))
}

fn restore_backup_as_primary(vault_path: &Path, backup_path: &Path) -> Result<(), String> {
    if vault_path.exists() {
        fs::remove_file(vault_path).map_err(|error| format!("无法移除损坏的主资产库：{error}"))?;
    }
    sync_parent_directory(vault_path)?;
    fs::rename(backup_path, vault_path)
        .map_err(|error| format!("无法恢复资产库安全备份：{error}"))?;
    sync_parent_directory(vault_path)?;
    Ok(())
}

fn keyring_entry_for(service: &str) -> Result<Entry, String> {
    Entry::new(service, KEYRING_ACCOUNT).map_err(|error| format!("无法访问系统凭据库：{error}"))
}

fn existing_keyring_vault_key() -> Result<Vec<u8>, String> {
    let services = [KEYRING_SERVICE.to_string(), legacy_app_identifier()];
    let mut errors = Vec::new();
    for service in services {
        let entry = keyring_entry_for(&service)?;
        match entry.get_secret() {
            Ok(key) if key.len() == 32 => return Ok(key),
            Ok(_) => errors.push("系统凭据库中的资产库密钥长度不正确".to_string()),
            Err(KeyringError::NoEntry) => {
                errors.push("旧版系统钥匙串中的资产库密钥不存在".to_string())
            }
            Err(error) => errors.push(format!("无法读取系统凭据库：{error}")),
        }
    }
    Err(errors.join("；"))
}

fn decrypt_vault_file(path: &Path, key: &[u8]) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("无法读取加密资产库：{error}"))?;
    let envelope: EncryptedVaultFile =
        serde_json::from_slice(&bytes).map_err(|error| format!("加密资产库格式不正确：{error}"))?;
    if envelope.version != 1 || envelope.nonce.len() != 12 {
        return Err("加密资产库版本或随机数格式不正确".to_string());
    }
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|error| format!("无法初始化解密器：{error}"))?;
    let nonce = envelope
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| "加密资产库随机数格式不正确".to_string())?;
    let plaintext = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: envelope.ciphertext.as_ref(),
                aad: VAULT_AAD,
            },
        )
        .or_else(|_| {
            let legacy_aad = legacy_vault_aad();
            cipher.decrypt(
                &nonce,
                Payload {
                    msg: envelope.ciphertext.as_ref(),
                    aad: legacy_aad.as_slice(),
                },
            )
        })
        .map_err(|_| "加密资产库校验失败，文件可能已损坏".to_string())?;
    let content =
        String::from_utf8(plaintext).map_err(|error| format!("资产库文本编码不正确：{error}"))?;
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("资产库内容格式不正确：{error}"))?;
    Ok(content)
}

fn load_secure_vault_sync(app: &AppHandle) -> Result<Option<String>, String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    if !vault_path.exists() && !backup_path.exists() {
        return Ok(None);
    }
    let key = read_local_vault_key(app)?.ok_or_else(|| {
        format!(
            "{LEGACY_KEY_MIGRATION_REQUIRED}:现有资产库仍使用旧版系统钥匙串密钥，请先迁移旧资产库"
        )
    })?;
    let (content, source) = load_existing_vault(&vault_path, &backup_path, &key)?;
    if source == Some(VaultSource::Backup) {
        return Err(format!(
            "{BACKUP_RECOVERY_REQUIRED}:主资产库无法读取，但安全备份仍然有效，请确认后恢复"
        ));
    }
    if let Some(content) = content {
        validate_vault_payload(&content, true)?;
        return Ok(Some(content));
    }
    Ok(None)
}

fn save_secure_vault_sync(
    app: &AppHandle,
    content: String,
    expected_revision: u64,
) -> Result<String, String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let mut payload = validate_vault_payload(&content, false)?;
    if vault_revision(&payload) != expected_revision {
        return Err("前端资产库版本与预期版本不一致".to_string());
    }
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    let key = get_or_create_local_vault_key(app, vault_path.exists() || backup_path.exists())?;
    let (current_content, source) = load_existing_vault(&vault_path, &backup_path, &key)?;
    let current_revision = current_content
        .as_deref()
        .map(|current| validate_vault_payload(current, true).map(|value| vault_revision(&value)))
        .transpose()?
        .unwrap_or(0);
    if current_revision != expected_revision {
        return Err(format!(
            "资产库版本冲突：磁盘版本为 {current_revision}，当前操作基于版本 {expected_revision}"
        ));
    }
    if source == Some(VaultSource::Backup) {
        restore_backup_as_primary(&vault_path, &backup_path)?;
    }
    let next_revision = expected_revision
        .checked_add(1)
        .ok_or_else(|| "资产库版本号已达到上限".to_string())?;
    payload["revision"] = Value::from(next_revision);
    let content =
        serde_json::to_string(&payload).map_err(|error| format!("无法编码资产库内容：{error}"))?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|error| format!("无法初始化加密器：{error}"))?;
    let nonce = Nonce::generate();
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: content.as_bytes(),
                aad: VAULT_AAD,
            },
        )
        .map_err(|_| "资产库加密失败".to_string())?;
    let envelope = EncryptedVaultFile {
        version: 1,
        nonce: nonce.to_vec(),
        ciphertext,
    };
    let encoded =
        serde_json::to_vec(&envelope).map_err(|error| format!("无法编码加密资产库：{error}"))?;
    let temporary_path = vault_path.with_extension("json.tmp");

    let mut temporary_options = OpenOptions::new();
    temporary_options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        temporary_options.mode(0o600);
    }
    let mut temporary_file = temporary_options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时资产库：{error}"))?;
    restrict_private_file(&temporary_path, "临时资产库")?;
    temporary_file
        .write_all(&encoded)
        .map_err(|error| format!("无法写入临时资产库：{error}"))?;
    temporary_file
        .sync_all()
        .map_err(|error| format!("无法同步临时资产库：{error}"))?;
    drop(temporary_file);
    let verified = decrypt_vault_file(&temporary_path, &key)?;
    if verified != content {
        let _ = fs::remove_file(&temporary_path);
        return Err("加密资产库写入校验不一致".to_string());
    }

    if vault_path.exists() {
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("无法清理旧资产库快照：{error}"))?;
            sync_parent_directory(&backup_path)?;
        }
        fs::rename(&vault_path, &backup_path)
            .map_err(|error| format!("无法创建资产库安全快照：{error}"))?;
        sync_parent_directory(&backup_path)?;
    }
    if let Err(error) = fs::rename(&temporary_path, &vault_path) {
        if backup_path.exists() && !vault_path.exists() {
            let _ = fs::rename(&backup_path, &vault_path);
            let _ = sync_parent_directory(&vault_path);
        }
        return Err(format!("无法替换加密资产库：{error}"));
    }
    sync_parent_directory(&vault_path)?;

    let persisted = decrypt_vault_file(&vault_path, &key)?;
    if persisted != content {
        return Err("加密资产库落盘校验不一致".to_string());
    }
    // Keep the previous successfully written version as a recovery point. The
    // next save rotates it before replacing the primary file.
    Ok(content)
}

fn migrate_legacy_vault_key_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    if read_local_vault_key(app)?.is_some() {
        return Ok(());
    }
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    if !vault_path.exists() && !backup_path.exists() {
        return Err("找不到需要迁移的旧版资产库".to_string());
    }
    let key = existing_keyring_vault_key()?;
    let (content, _) = load_existing_vault(&vault_path, &backup_path, &key)?;
    let content = content.ok_or_else(|| "找不到需要迁移的旧版资产库".to_string())?;
    validate_vault_payload(&content, true)?;
    write_local_vault_key(app, &key)
}

fn recover_vault_backup_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    if !backup_path.exists() {
        return Err("找不到可恢复的资产库安全备份".to_string());
    }
    let key = read_local_vault_key(app)?.ok_or_else(|| "本地资产库密钥不存在".to_string())?;
    if vault_path.exists() && decrypt_vault_file(&vault_path, &key).is_ok() {
        return Err("主资产库已经恢复可读，请重新读取，未使用旧备份覆盖".to_string());
    }
    let content = decrypt_vault_file(&backup_path, &key)?;
    validate_vault_payload(&content, true)?;
    restore_backup_as_primary(&vault_path, &backup_path)
}

#[tauri::command]
async fn load_secure_vault(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || load_secure_vault_sync(&app))
        .await
        .map_err(|error| format!("资产库读取任务失败：{error}"))?
}

#[tauri::command]
async fn save_secure_vault(
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
async fn migrate_legacy_vault_key(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || migrate_legacy_vault_key_sync(&app))
        .await
        .map_err(|error| format!("旧版资产库密钥迁移任务失败：{error}"))?
}

#[tauri::command]
async fn recover_vault_backup(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || recover_vault_backup_sync(&app))
        .await
        .map_err(|error| format!("资产库安全备份恢复任务失败：{error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            #[cfg(target_os = "macos")]
            let _ = app.show();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::PhysicalSize;

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window
                    .current_monitor()
                    .or_else(|_| window.primary_monitor())
                {
                    let screen_size = monitor.size();
                    let width = ((screen_size.width as f64) * 0.75).round() as u32;
                    let height = ((screen_size.height as f64) * 0.75).round() as u32;

                    let _ = window.set_size(PhysicalSize::new(width.max(1024), height.max(720)));
                    let _ = window.center();
                }
            }

            #[cfg(desktop)]
            {
                let show_item =
                    MenuItem::with_id(app, "show", "打开密码管理器", true, None::<&str>)?;
                let exit_item = MenuItem::with_id(app, "exit", "关闭程序", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &exit_item])?;
                let mut tray = TrayIconBuilder::with_id("main")
                    .menu(&menu)
                    .tooltip("密码管理器")
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        if event.id() == "show" {
                            restore_main_window(app);
                        } else if event.id() == "exit" {
                            let _ = app.emit("tray-exit-requested", ());
                        }
                    });
                if let Some(icon) = app.default_window_icon().cloned() {
                    tray = tray.icon(icon);
                }
                tray.build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_secure_vault,
            save_secure_vault,
            migrate_legacy_vault_key,
            recover_vault_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
