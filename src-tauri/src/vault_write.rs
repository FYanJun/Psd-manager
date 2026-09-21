use crate::private_files::{restrict_private_file, sync_parent_directory};
use crate::vault_read::{decrypt_vault_file, load_existing_vault, VaultSource};
use crate::vault_validation::validate_vault_payload;
use crate::vault_validation::vault_revision;
use crate::{
    EncryptedVaultFile, BACKUP_RECOVERY_REQUIRED, VAULT_AAD, VAULT_BACKUP_FILE_NAME,
    VAULT_FILE_NAME,
};
use aes_gcm::{
    aead::{Aead, Generate, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

// Caller holds process and file locks and validates the supplied payload.
pub(crate) fn save_payload(
    vault_path: &Path,
    backup_path: &Path,
    key: &[u8],
    mut payload: Value,
    expected_revision: u64,
) -> Result<String, String> {
    let (current_content, source) = load_existing_vault(&vault_path, &backup_path, &key)?;
    let current_revision = current_content
        .as_deref()
        .map(|current| validate_vault_payload(current).map(|value| vault_revision(&value)))
        .transpose()?
        .unwrap_or(0);
    if current_revision != expected_revision {
        return Err(format!(
            "资产库版本冲突：磁盘版本为 {current_revision}，当前操作基于版本 {expected_revision}"
        ));
    }
    if source == Some(VaultSource::Backup) {
        return Err(format!(
            "{BACKUP_RECOVERY_REQUIRED}:主资产库无法读取，但安全备份仍然有效，请确认后恢复"
        ));
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
    let temporary_path = vault_path.with_file_name(format!("{VAULT_FILE_NAME}.tmp"));

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

    let previous_backup_path = if backup_path.exists() {
        Some(vault_path.with_file_name(format!(
            "{VAULT_BACKUP_FILE_NAME}.previous-{}",
            std::process::id()
        )))
    } else {
        None
    };
    if let Some(previous_backup_path) = &previous_backup_path {
        let _ = fs::remove_file(previous_backup_path);
        fs::rename(&backup_path, previous_backup_path)
            .map_err(|error| format!("无法暂存旧资产库安全快照：{error}"))?;
    }
    if vault_path.exists() {
        if let Err(error) = fs::rename(&vault_path, &backup_path) {
            if let Some(previous_backup_path) = &previous_backup_path {
                let _ = fs::rename(previous_backup_path, &backup_path);
            }
            let _ = fs::remove_file(&temporary_path);
            return Err(format!("无法创建资产库安全快照：{error}"));
        }
        // Directory fsync is best-effort; the file contents were already
        // flushed and the rotation remains recoverable if the platform refuses
        // to sync a directory.
        let _ = sync_parent_directory(&backup_path);
    }
    if let Err(error) = fs::rename(&temporary_path, &vault_path) {
        let mut restore_errors = Vec::new();
        if backup_path.exists() && !vault_path.exists() {
            if let Err(restore_error) = fs::rename(&backup_path, &vault_path) {
                restore_errors.push(format!("恢复主资产库失败：{restore_error}"));
            } else {
                let _ = sync_parent_directory(&vault_path);
            }
        }
        if let Some(previous_backup_path) = &previous_backup_path {
            if let Err(restore_error) = fs::rename(previous_backup_path, &backup_path) {
                restore_errors.push(format!("恢复旧安全快照失败：{restore_error}"));
            }
        }
        let _ = fs::remove_file(&temporary_path);
        return if restore_errors.is_empty() {
            Err(format!("无法替换加密资产库：{error}"))
        } else {
            Err(format!(
                "无法替换加密资产库：{error}；{}",
                restore_errors.join("；")
            ))
        };
    }
    let _ = sync_parent_directory(&vault_path);
    if let Some(previous_backup_path) = &previous_backup_path {
        // The new primary and its recovery point are already durable. Failure
        // to remove an older recovery point must not turn a successful save into
        // a misleading error or discard the current recovery chain.
        let _ = fs::remove_file(previous_backup_path);
    }

    let persisted = decrypt_vault_file(&vault_path, &key)?;
    if persisted != content {
        return Err("加密资产库落盘校验不一致".to_string());
    }
    // Keep the previous successfully written version as a recovery point. The
    // next save rotates it before replacing the primary file.
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-save-test-{}-{}",
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
    fn payload(revision: u64) -> Value {
        serde_json::json!({"schemaVersion":2,"revision":revision,"items":[],"customDeviceTypes":[],"snapshots":[]})
    }
    #[test]
    fn save_increments_revision_and_rotates_previous_primary() {
        let dir = Scratch::new();
        let primary = dir.0.join(VAULT_FILE_NAME);
        let backup = dir.0.join(VAULT_BACKUP_FILE_NAME);
        let key = [9; 32];
        let first = save_payload(&primary, &backup, &key, payload(0), 0).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&first).unwrap()["revision"],
            1
        );
        assert!(!backup.exists());
        let second = save_payload(&primary, &backup, &key, payload(1), 1).unwrap();
        assert_eq!(decrypt_vault_file(&primary, &key).unwrap(), second);
        assert_eq!(decrypt_vault_file(&backup, &key).unwrap(), first);
        let third = save_payload(&primary, &backup, &key, payload(2), 2).unwrap();
        assert_eq!(decrypt_vault_file(&primary, &key).unwrap(), third);
        assert_eq!(decrypt_vault_file(&backup, &key).unwrap(), second);
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 2);
    }
    #[test]
    fn stale_revision_and_backup_only_state_never_overwrite_files() {
        let dir = Scratch::new();
        let primary = dir.0.join(VAULT_FILE_NAME);
        let backup = dir.0.join(VAULT_BACKUP_FILE_NAME);
        let key = [9; 32];
        save_payload(&primary, &backup, &key, payload(0), 0).unwrap();
        let before = fs::read(&primary).unwrap();
        assert!(save_payload(&primary, &backup, &key, payload(0), 0)
            .unwrap_err()
            .contains("版本冲突"));
        assert_eq!(fs::read(&primary).unwrap(), before);
        fs::rename(&primary, &backup).unwrap();
        assert!(save_payload(&primary, &backup, &key, payload(1), 1)
            .unwrap_err()
            .starts_with(BACKUP_RECOVERY_REQUIRED));
        assert!(!primary.exists());
        assert_eq!(fs::read(&backup).unwrap(), before);
    }
}
