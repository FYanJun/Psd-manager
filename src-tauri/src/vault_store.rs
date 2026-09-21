use crate::key_wrap::{
    PasswordLockFile, PASSWORD_LOCK_VERSION, PASSWORD_NONCE_LENGTH, PASSWORD_TAG_LENGTH,
};
use crate::password_kdf::{
    validate_password_kdf_parameters, PASSWORD_KEY_LENGTH, PASSWORD_SALT_LENGTH,
};
use crate::private_files::{restrict_private_file, sync_parent_directory, write_private_bytes};
use crate::storage_paths::{ensure_vault_directory, vault_paths};
use crate::vault_read::{load_existing_vault, load_valid_vault_file, VaultSource};
use crate::vault_validation::{validate_vault_payload, vault_revision};
use crate::{
    vault_write, BACKUP_RECOVERY_REQUIRED, VAULT_KEY_FILE_NAME, VAULT_LOCK_FILE_NAME,
    VAULT_PASSWORD_FILE_NAME,
};
use aes_gcm::{
    aead::{Generate, Key},
    Aes256Gcm,
};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

pub(crate) static VAULT_IO_LOCK: Mutex<()> = Mutex::new(());
pub(crate) struct VaultSession(pub(crate) Mutex<Option<Vec<u8>>>);

pub(crate) fn lock_vault_file(app: &AppHandle) -> Result<File, String> {
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

pub(crate) fn vault_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(VAULT_KEY_FILE_NAME))
}

pub(crate) fn password_lock_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(VAULT_PASSWORD_FILE_NAME))
}

pub(crate) fn read_password_lock_file(app: &AppHandle) -> Result<Option<PasswordLockFile>, String> {
    let path = password_lock_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    restrict_private_file(&path, "启动密码配置")?;
    let bytes = fs::read(&path).map_err(|error| format!("无法读取启动密码配置：{error}"))?;
    let lock_file: PasswordLockFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("启动密码配置格式不正确：{error}"))?;
    if lock_file.version != PASSWORD_LOCK_VERSION
        || lock_file.salt.len() != PASSWORD_SALT_LENGTH
        || lock_file.nonce.len() != PASSWORD_NONCE_LENGTH
        || lock_file.wrapped_key.len() != PASSWORD_KEY_LENGTH + PASSWORD_TAG_LENGTH
        || (!lock_file.recovery_nonce.is_empty()
            && lock_file.recovery_nonce.len() != PASSWORD_NONCE_LENGTH)
        || (!lock_file.recovery_wrapped_key.is_empty()
            && lock_file.recovery_wrapped_key.len() != PASSWORD_KEY_LENGTH + PASSWORD_TAG_LENGTH)
    {
        return Err("启动密码配置版本或密钥数据不正确".to_string());
    }
    validate_password_kdf_parameters(&lock_file.salt, &lock_file.kdf)?;
    Ok(Some(lock_file))
}

pub(crate) fn write_password_lock_file(
    app: &AppHandle,
    lock_file: &PasswordLockFile,
) -> Result<(), String> {
    let path = password_lock_path(app)?;
    let encoded =
        serde_json::to_vec(lock_file).map_err(|error| format!("无法编码启动密码配置：{error}"))?;
    write_private_bytes(&path, &encoded, "启动密码配置")
}

fn active_vault_key(app: &AppHandle, session: &VaultSession) -> Result<Vec<u8>, String> {
    if read_password_lock_file(app)?.is_some() {
        return session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())?
            .clone()
            .ok_or_else(|| "VAULT_LOCKED:资产库已锁定，请先解锁".to_string());
    }
    read_local_vault_key(app)?.ok_or_else(|| "资产库密钥不存在或已丢失，无法打开资产库".to_string())
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

pub(crate) fn read_local_vault_key(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
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

pub(crate) fn write_local_vault_key(app: &AppHandle, key: &[u8]) -> Result<(), String> {
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
    restrict_private_file(&key_path, "资产库密钥")?;
    sync_parent_directory(&key_path)?;
    Ok(())
}

pub(crate) fn get_or_create_local_vault_key(
    app: &AppHandle,
    vault_exists: bool,
) -> Result<Vec<u8>, String> {
    if let Some(key) = read_local_vault_key(app)? {
        return Ok(key);
    }
    if vault_exists {
        return Err("资产库密钥不存在或已丢失，无法打开现有资产库".to_string());
    }
    let key = Key::<Aes256Gcm>::generate().to_vec();
    write_local_vault_key(app, &key)?;
    Ok(key)
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

pub(crate) fn load_secure_vault_sync(app: &AppHandle) -> Result<Option<String>, String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    if !vault_path.exists() && !backup_path.exists() {
        return Ok(None);
    }
    let session = app.state::<VaultSession>();
    let key = active_vault_key(app, &session)?;
    let (content, source) = load_existing_vault(&vault_path, &backup_path, &key)?;
    if source == Some(VaultSource::Backup) {
        return Err(format!(
            "{BACKUP_RECOVERY_REQUIRED}:主资产库无法读取，但安全备份仍然有效，请确认后恢复"
        ));
    }
    if let Some(content) = content {
        validate_vault_payload(&content)?;
        return Ok(Some(content));
    }
    Ok(None)
}

pub(crate) fn save_secure_vault_sync(
    app: &AppHandle,
    content: String,
    expected_revision: u64,
) -> Result<String, String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let payload = validate_vault_payload(&content)?;
    if vault_revision(&payload) != expected_revision {
        return Err("前端资产库版本与预期版本不一致".to_string());
    }
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    let session = app.state::<VaultSession>();
    let key =
        if vault_path.exists() || backup_path.exists() || read_password_lock_file(app)?.is_some() {
            active_vault_key(app, &session)?
        } else {
            get_or_create_local_vault_key(app, false)?
        };
    vault_write::save_payload(&vault_path, &backup_path, &key, payload, expected_revision)
}

pub(crate) fn recover_vault_backup_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    if !backup_path.exists() {
        return Err("找不到可恢复的资产库安全备份".to_string());
    }
    let session = app.state::<VaultSession>();
    let key = active_vault_key(app, &session)?;
    if vault_path.exists() && load_valid_vault_file(&vault_path, &key).is_ok() {
        return Err("主资产库已经恢复可读，请重新读取，未使用旧备份覆盖".to_string());
    }
    load_valid_vault_file(&backup_path, &key)?;
    restore_backup_as_primary(&vault_path, &backup_path)
}
