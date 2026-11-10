use crate::key_wrap::{PasswordLockFile, PASSWORD_NONCE_LENGTH, PASSWORD_TAG_LENGTH};
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
static PASSWORD_FILE_IO_LOCK: Mutex<()> = Mutex::new(());
pub(crate) struct VaultSession(pub(crate) Mutex<Option<Vec<u8>>>);

#[derive(Debug)]
pub(crate) struct PasswordLockWriteOutcome {
    pub(crate) cleanup_warning: Option<String>,
}

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
    let _guard = PASSWORD_FILE_IO_LOCK
        .lock()
        .map_err(|_| "启动密码配置文件锁已损坏".to_string())?;
    let path = password_lock_path(app)?;
    read_password_lock_path(&path)
}

fn parse_password_lock(bytes: &[u8]) -> Result<PasswordLockFile, String> {
    let mut lock_file: PasswordLockFile = serde_json::from_slice(bytes)
        .map_err(|error| format!("启动密码配置格式不正确：{error}"))?;
    if lock_file.legacy_version.is_some_and(|version| version != 1)
        || lock_file.salt.len() != PASSWORD_SALT_LENGTH
        || lock_file.nonce.len() != PASSWORD_NONCE_LENGTH
        || lock_file.wrapped_key.len() != PASSWORD_KEY_LENGTH + PASSWORD_TAG_LENGTH
        || (!lock_file.recovery_nonce.is_empty()
            && lock_file.recovery_nonce.len() != PASSWORD_NONCE_LENGTH)
        || (!lock_file.recovery_wrapped_key.is_empty()
            && lock_file.recovery_wrapped_key.len() != PASSWORD_KEY_LENGTH + PASSWORD_TAG_LENGTH)
        || lock_file.recovery_nonce.is_empty() != lock_file.recovery_wrapped_key.is_empty()
    {
        return Err("启动密码配置或密钥数据不正确".to_string());
    }
    validate_password_kdf_parameters(&lock_file.salt, &lock_file.kdf)?;
    lock_file.legacy_version = None;
    Ok(lock_file)
}

fn password_lock_artifacts(path: &Path) -> Result<Vec<PathBuf>, String> {
    let directory = path
        .parent()
        .ok_or_else(|| "启动密码配置目录不正确".to_string())?;
    let prefix = format!(".{VAULT_PASSWORD_FILE_NAME}.replace-backup-");
    let mut paths = Vec::new();
    for entry in
        fs::read_dir(directory).map_err(|error| format!("无法检查启动密码配置恢复文件：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法检查启动密码配置恢复文件：{error}"))?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(&prefix)
            || entry.path() == path.with_extension("tmp")
            || name == format!("{VAULT_PASSWORD_FILE_NAME}.tmp").as_str()
        {
            paths.push(entry.path());
        }
    }
    Ok(paths)
}

fn publish_recovered_password_lock(path: &Path, bytes: &[u8]) -> Result<PasswordLockFile, String> {
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            // Another writer won the race. Its committed file is authoritative;
            // never replace it with the older recovery candidate.
            restrict_private_file(path, "启动密码配置")?;
            let current = fs::read(path)
                .map_err(|error| format!("无法读取并发写入的启动密码配置：{error}"))?;
            return parse_password_lock(&current);
        }
        Err(error) => return Err(format!("无法恢复启动密码配置：{error}")),
    };
    restrict_private_file(path, "启动密码配置")?;
    file.write_all(bytes)
        .map_err(|error| format!("无法恢复启动密码配置：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步恢复的启动密码配置：{error}"))?;
    drop(file);
    sync_parent_directory(path)?;
    parse_password_lock(bytes)
}

fn read_password_lock_path(path: &Path) -> Result<Option<PasswordLockFile>, String> {
    if path.exists() {
        restrict_private_file(path, "启动密码配置")?;
        let bytes = fs::read(path).map_err(|error| format!("无法读取启动密码配置：{error}"))?;
        return parse_password_lock(&bytes).map(Some);
    }
    let artifacts = password_lock_artifacts(path)?;
    let prefix = format!(".{VAULT_PASSWORD_FILE_NAME}.replace-backup-");
    let mut valid_content: Option<Vec<u8>> = None;
    for candidate in &artifacts {
        if !candidate
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with(&prefix))
        {
            // A .tmp file has never been committed, even if its JSON is valid.
            continue;
        }
        restrict_private_file(candidate, "启动密码配置恢复文件")?;
        let bytes = fs::read(candidate)
            .map_err(|error| format!("无法读取启动密码配置恢复文件：{error}"))?;
        if parse_password_lock(&bytes).is_err() {
            continue;
        }
        if valid_content
            .as_ref()
            .is_some_and(|current| current != &bytes)
        {
            return Err(
                "发现多份不同的有效启动密码配置恢复文件，请保留文件并检查，未自动选择".to_string(),
            );
        }
        valid_content = Some(bytes);
    }
    match valid_content {
        Some(bytes) => publish_recovered_password_lock(path, &bytes).map(Some),
        None if artifacts.is_empty() => Ok(None),
        None => Err("启动密码配置缺失且存在未完成写入，无法安全恢复，请保留现有文件".to_string()),
    }
}

// Intentional disable must remove recovery clues before removing the committed
// file, otherwise a later read could re-enable a previously recovered lock.
pub(crate) fn remove_password_lock_file(app: &AppHandle) -> Result<(), String> {
    let _guard = PASSWORD_FILE_IO_LOCK
        .lock()
        .map_err(|_| "启动密码配置文件锁已损坏".to_string())?;
    remove_password_lock_path(&password_lock_path(app)?)
}

fn remove_password_lock_path(path: &Path) -> Result<(), String> {
    clear_password_lock_artifacts(path)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法移除启动密码配置：{error}"))?;
        sync_parent_directory(path)?;
    }
    Ok(())
}

fn clear_password_lock_artifacts(path: &Path) -> Result<(), String> {
    for artifact in password_lock_artifacts(path)? {
        fs::remove_file(&artifact)
            .map_err(|error| format!("无法清理启动密码配置恢复文件：{error}"))?;
    }
    sync_parent_directory(path)
}

fn finish_password_lock_write(
    path: &Path,
    encoded: &[u8],
) -> Result<PasswordLockWriteOutcome, String> {
    restrict_private_file(path, "启动密码配置")?;
    let persisted = fs::read(path).map_err(|error| format!("无法复验启动密码配置：{error}"))?;
    parse_password_lock(&persisted)?;
    if persisted != encoded {
        return Err("启动密码配置写入校验不一致".to_string());
    }
    // The new password is already committed and verified. A cleanup failure is
    // a warning, never an ordinary save failure that could trigger key rollback.
    let cleanup_warning = clear_password_lock_artifacts(path).err().map(|error| {
        format!("新启动密码已生效，但旧密码恢复副本清理未完成：{error}。请重试清理旧副本")
    });
    Ok(PasswordLockWriteOutcome { cleanup_warning })
}

fn write_password_lock_path(
    path: &Path,
    encoded: &[u8],
) -> Result<PasswordLockWriteOutcome, String> {
    parse_password_lock(encoded)?;
    // Do not start a password change while historical wrapping material cannot
    // be retired. If the primary is absent, recover or reject its clues first.
    read_password_lock_path(path)?;
    clear_password_lock_artifacts(path)?;
    write_private_bytes(path, encoded, "启动密码配置")?;
    finish_password_lock_write(path, encoded)
}

pub(crate) fn write_password_lock_file(
    app: &AppHandle,
    lock_file: &PasswordLockFile,
) -> Result<PasswordLockWriteOutcome, String> {
    let _guard = PASSWORD_FILE_IO_LOCK
        .lock()
        .map_err(|_| "启动密码配置文件锁已损坏".to_string())?;
    let path = password_lock_path(app)?;
    let encoded =
        serde_json::to_vec(lock_file).map_err(|error| format!("无法编码启动密码配置：{error}"))?;
    write_password_lock_path(&path, &encoded)
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

#[cfg(test)]
mod password_lock_recovery_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_SCRATCH_ID: AtomicU64 = AtomicU64::new(0);

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-password-recovery-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_SCRATCH_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn target(&self) -> PathBuf {
            self.0.join(VAULT_PASSWORD_FILE_NAME)
        }

        fn candidate(&self, suffix: &str) -> PathBuf {
            self.0.join(format!(
                ".{VAULT_PASSWORD_FILE_NAME}.replace-backup-{suffix}"
            ))
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn lock_bytes(nonce_byte: u8) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "kdf":{"memoryKib":65536,"iterations":3,"parallelism":1},
            "salt":vec![1;PASSWORD_SALT_LENGTH],
            "nonce":vec![nonce_byte;PASSWORD_NONCE_LENGTH],
            "wrappedKey":vec![2;PASSWORD_KEY_LENGTH+PASSWORD_TAG_LENGTH],
            "recoveryNonce":vec![3;PASSWORD_NONCE_LENGTH],
            "recoveryWrappedKey":vec![4;PASSWORD_KEY_LENGTH+PASSWORD_TAG_LENGTH]
        }))
        .unwrap()
    }

    #[test]
    fn missing_primary_recovers_identical_committed_candidates_and_preserves_clues() {
        let dir = Scratch::new();
        let bytes = lock_bytes(5);
        for suffix in ["first", "second"] {
            fs::write(dir.candidate(suffix), &bytes).unwrap();
        }
        let temporary = dir.target().with_extension("tmp");
        fs::write(&temporary, lock_bytes(6)).unwrap();
        assert!(read_password_lock_path(&dir.target()).unwrap().is_some());
        assert_eq!(fs::read(dir.target()).unwrap(), bytes);
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), bytes);
        assert_eq!(fs::read(dir.candidate("second")).unwrap(), bytes);
        assert_eq!(fs::read(&temporary).unwrap(), lock_bytes(6));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [
                dir.target(),
                dir.candidate("first"),
                dir.candidate("second"),
            ] {
                assert_eq!(
                    fs::metadata(path).unwrap().permissions().mode() & 0o777,
                    0o600
                );
            }
        }
    }

    #[test]
    fn different_valid_candidates_are_never_guessed_or_removed() {
        let dir = Scratch::new();
        fs::write(dir.candidate("first"), lock_bytes(5)).unwrap();
        fs::write(dir.candidate("second"), lock_bytes(6)).unwrap();
        let error = read_password_lock_path(&dir.target()).err().unwrap();
        assert!(error.contains("多份不同"));
        assert!(!dir.target().exists());
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), lock_bytes(5));
        assert_eq!(fs::read(dir.candidate("second")).unwrap(), lock_bytes(6));
    }

    #[test]
    fn corrupt_primary_is_preserved_even_when_a_valid_candidate_exists() {
        let dir = Scratch::new();
        fs::write(dir.target(), b"corrupt").unwrap();
        fs::write(dir.candidate("first"), lock_bytes(5)).unwrap();
        assert!(read_password_lock_path(&dir.target()).is_err());
        assert_eq!(fs::read(dir.target()).unwrap(), b"corrupt");
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), lock_bytes(5));
    }

    #[test]
    fn uncommitted_temporary_and_invalid_candidates_do_not_disable_lock() {
        let dir = Scratch::new();
        assert!(read_password_lock_path(&dir.target()).unwrap().is_none());
        fs::write(dir.target().with_extension("tmp"), lock_bytes(5)).unwrap();
        assert!(read_password_lock_path(&dir.target()).is_err());
        assert!(!dir.target().exists());
        fs::write(dir.candidate("invalid"), b"corrupt").unwrap();
        assert!(read_password_lock_path(&dir.target()).is_err());
        assert_eq!(fs::read(dir.candidate("invalid")).unwrap(), b"corrupt");
    }

    #[test]
    fn recovery_does_not_overwrite_another_committed_file() {
        let dir = Scratch::new();
        fs::write(dir.target(), lock_bytes(6)).unwrap();
        let recovered = publish_recovered_password_lock(&dir.target(), &lock_bytes(5)).unwrap();
        assert_eq!(recovered.nonce, vec![6; PASSWORD_NONCE_LENGTH]);
        assert_eq!(fs::read(dir.target()).unwrap(), lock_bytes(6));
    }

    #[test]
    fn intentional_disable_clears_recovery_clues_before_primary() {
        let dir = Scratch::new();
        fs::write(dir.target(), lock_bytes(5)).unwrap();
        fs::write(dir.candidate("first"), lock_bytes(5)).unwrap();
        fs::write(dir.target().with_extension("tmp"), lock_bytes(6)).unwrap();
        let unrelated = dir.0.join("vault.enc");
        fs::write(&unrelated, b"keep").unwrap();
        remove_password_lock_path(&dir.target()).unwrap();
        assert!(read_password_lock_path(&dir.target()).unwrap().is_none());
        assert_eq!(fs::read(unrelated).unwrap(), b"keep");
    }

    #[test]
    fn malformed_wrapping_fields_are_rejected_before_recovery() {
        for (field, value) in [
            ("salt", serde_json::json!([1])),
            ("nonce", serde_json::json!([1])),
            ("wrappedKey", serde_json::json!([1])),
            ("recoveryNonce", serde_json::json!([])),
            ("recoveryWrappedKey", serde_json::json!([])),
            ("unknown", serde_json::json!(true)),
        ] {
            let mut content: serde_json::Value = serde_json::from_slice(&lock_bytes(5)).unwrap();
            content[field] = value;
            assert!(
                parse_password_lock(&serde_json::to_vec(&content).unwrap()).is_err(),
                "{field}"
            );
        }
        let mut content: serde_json::Value = serde_json::from_slice(&lock_bytes(5)).unwrap();
        content["kdf"]["memoryKib"] = serde_json::json!(524289);
        assert!(parse_password_lock(&serde_json::to_vec(&content).unwrap()).is_err());
    }

    #[test]
    fn password_change_retires_old_wrapping_material_after_recovery() {
        let dir = Scratch::new();
        let old_candidate = dir.candidate("first");
        fs::write(&old_candidate, lock_bytes(5)).unwrap();
        assert!(read_password_lock_path(&dir.target()).unwrap().is_some());
        let temporary = dir.target().with_extension("tmp");
        fs::write(&temporary, lock_bytes(5)).unwrap();
        let unrelated = dir.0.join("vault.enc");
        fs::write(&unrelated, b"keep").unwrap();
        let outcome = write_password_lock_path(&dir.target(), &lock_bytes(6)).unwrap();
        assert!(outcome.cleanup_warning.is_none());
        assert_eq!(fs::read(dir.target()).unwrap(), lock_bytes(6));
        assert!(password_lock_artifacts(&dir.target()).unwrap().is_empty());
        assert_eq!(fs::read(&unrelated).unwrap(), b"keep");
        fs::remove_file(dir.target()).unwrap();
        assert!(read_password_lock_path(&dir.target()).unwrap().is_none());
    }

    #[test]
    fn cleanup_failure_before_password_change_preserves_committed_password() {
        let dir = Scratch::new();
        fs::write(dir.target(), lock_bytes(5)).unwrap();
        let blocked_cleanup = dir.candidate("blocked");
        fs::create_dir(&blocked_cleanup).unwrap();
        assert!(write_password_lock_path(&dir.target(), &lock_bytes(6)).is_err());
        assert_eq!(fs::read(dir.target()).unwrap(), lock_bytes(5));
        assert!(blocked_cleanup.exists());
    }

    #[test]
    fn cleanup_failure_after_verified_commit_is_a_success_warning() {
        let dir = Scratch::new();
        let committed = lock_bytes(6);
        fs::write(dir.target(), &committed).unwrap();
        let blocked_cleanup = dir.candidate("blocked");
        fs::create_dir(&blocked_cleanup).unwrap();
        let outcome = finish_password_lock_write(&dir.target(), &committed).unwrap();
        assert!(outcome
            .cleanup_warning
            .unwrap()
            .contains("新启动密码已生效"));
        assert_eq!(fs::read(dir.target()).unwrap(), committed);
        assert!(blocked_cleanup.exists());
    }

    #[test]
    fn write_validation_precedes_old_candidate_cleanup() {
        let dir = Scratch::new();
        fs::write(dir.target(), lock_bytes(5)).unwrap();
        fs::write(dir.candidate("first"), lock_bytes(5)).unwrap();
        assert!(write_password_lock_path(&dir.target(), b"corrupt").is_err());
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), lock_bytes(5));
        assert!(finish_password_lock_write(&dir.target(), &lock_bytes(6)).is_err());
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), lock_bytes(5));
        fs::write(dir.target(), b"corrupt").unwrap();
        assert!(write_password_lock_path(&dir.target(), &lock_bytes(6)).is_err());
        assert_eq!(fs::read(dir.candidate("first")).unwrap(), lock_bytes(5));
    }
}
