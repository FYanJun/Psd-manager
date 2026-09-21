use crate::vault_validation::validate_vault_payload;
use crate::{EncryptedVaultFile, VAULT_AAD};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm,
};
use std::{fs, path::Path};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum VaultSource {
    Primary,
    Backup,
}

pub(crate) fn load_existing_vault(
    vault_path: &Path,
    backup_path: &Path,
    key: &[u8],
) -> Result<(Option<String>, Option<VaultSource>), String> {
    if vault_path.exists() {
        match load_valid_vault_file(vault_path, key) {
            Ok(content) => return Ok((Some(content), Some(VaultSource::Primary))),
            Err(primary_error) if backup_path.exists() => {
                return load_valid_vault_file(backup_path, key)
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
        return load_valid_vault_file(backup_path, key)
            .map(|content| (Some(content), Some(VaultSource::Backup)));
    }
    Ok((None, None))
}

pub(crate) fn decrypt_vault_file(path: &Path, key: &[u8]) -> Result<String, String> {
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
        .map_err(|_| "加密资产库校验失败，文件可能已损坏".to_string())?;
    let content =
        String::from_utf8(plaintext).map_err(|error| format!("资产库文本编码不正确：{error}"))?;
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("资产库内容格式不正确：{error}"))?;
    Ok(content)
}

pub(crate) fn load_valid_vault_file(path: &Path, key: &[u8]) -> Result<String, String> {
    let content = decrypt_vault_file(path, key)?;
    validate_vault_payload(&content)?;
    Ok(content)
}

#[cfg(test)]
mod vault_read_tests {
    use super::*;
    use aes_gcm::{aead::Generate, Nonce};
    use serde_json::Value;
    use std::path::PathBuf;
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-read-test-{}-{}",
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
    fn encrypted(key: &[u8], revision: u64) -> Vec<u8> {
        let content = serde_json::json!({"schemaVersion":2,"revision":revision,"items":[],"customDeviceTypes":[],"snapshots":[]}).to_string();
        let cipher = Aes256Gcm::new_from_slice(key).unwrap();
        let nonce = Nonce::generate();
        let ciphertext = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: content.as_bytes(),
                    aad: VAULT_AAD,
                },
            )
            .unwrap();
        serde_json::to_vec(&EncryptedVaultFile {
            version: 1,
            nonce: nonce.to_vec(),
            ciphertext,
        })
        .unwrap()
    }
    #[test]
    fn primary_preferred_and_backup_selection_never_mutates_files() {
        let dir = Scratch::new();
        let primary = dir.0.join("vault.enc");
        let backup = dir.0.join("vault.enc.bak");
        let key = [7; 32];
        let primary_bytes = encrypted(&key, 2);
        let backup_bytes = encrypted(&key, 1);
        fs::write(&primary, &primary_bytes).unwrap();
        fs::write(&backup, &backup_bytes).unwrap();
        let (content, source) = load_existing_vault(&primary, &backup, &key).unwrap();
        assert!(source == Some(VaultSource::Primary));
        assert_eq!(
            serde_json::from_str::<Value>(&content.unwrap()).unwrap()["revision"],
            2
        );
        fs::write(&primary, b"corrupt").unwrap();
        let (_, source) = load_existing_vault(&primary, &backup, &key).unwrap();
        assert!(source == Some(VaultSource::Backup));
        assert_eq!(fs::read(&primary).unwrap(), b"corrupt");
        assert_eq!(fs::read(&backup).unwrap(), backup_bytes);
    }
    #[test]
    fn missing_both_is_empty_but_wrong_key_or_corruption_is_not() {
        let dir = Scratch::new();
        let primary = dir.0.join("vault.enc");
        let backup = dir.0.join("vault.enc.bak");
        let (content, source) = load_existing_vault(&primary, &backup, &[7; 32]).unwrap();
        assert!(content.is_none() && source.is_none());
        fs::write(&backup, encrypted(&[7; 32], 1)).unwrap();
        assert!(load_existing_vault(&primary, &backup, &[8; 32]).is_err());
        fs::write(&primary, b"corrupt").unwrap();
        fs::write(&backup, b"also corrupt").unwrap();
        assert!(load_existing_vault(&primary, &backup, &[7; 32])
            .err()
            .unwrap()
            .contains("安全备份也无法读取"));
    }
}
