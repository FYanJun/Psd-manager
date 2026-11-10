use crate::password_kdf::{
    derive_password_key, password_lock_parameters, validate_master_password, PasswordKdfParameters,
    PASSWORD_SALT_LENGTH,
};
use crate::settings::validate_app_settings_content;
use crate::vault_validation::validate_vault_payload;
use aes_gcm::{
    aead::{Aead, Generate, Key, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const MAX_BACKUP_FILE_BYTES: usize = 100 * 1024 * 1024;
// JSON represents each encrypted byte with at most four bytes, including its
// separator. Reserve room for the authenticated tag and the envelope metadata.
const MAX_BACKUP_PLAINTEXT_BYTES: usize = (MAX_BACKUP_FILE_BYTES - 4096) / 4;
const BACKUP_FORMAT: &str = "psd-manager-backup";
const BACKUP_AAD: &[u8] = b"com.fan.psd-manager:encrypted-backup:1";
const NONCE_LENGTH: usize = 12;
const TAG_LENGTH: usize = 16;

#[derive(Debug)]
pub(crate) struct BackupContent {
    pub(crate) vault: String,
    pub(crate) settings: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct BackupEnvelope {
    format: String,
    kdf: PasswordKdfParameters,
    salt: Vec<u8>,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct BackupPayload {
    vault: Value,
    settings: Option<Value>,
}

fn backup_password_error(error: String) -> String {
    error.replace("主密码", "备份密码")
}

fn validate_backup_password(password: &str) -> Result<(), String> {
    validate_master_password(password).map_err(backup_password_error)
}

fn normalized_payload(
    vault_content: &str,
    settings_content: Option<&str>,
) -> Result<BackupPayload, String> {
    if vault_content
        .len()
        .saturating_add(settings_content.map_or(0, str::len))
        > MAX_BACKUP_PLAINTEXT_BYTES
    {
        return Err("备份内容过大，无法生成或恢复加密备份".to_string());
    }
    Ok(BackupPayload {
        vault: validate_vault_payload(vault_content)?,
        settings: settings_content
            .map(validate_app_settings_content)
            .transpose()?,
    })
}

fn validate_envelope(envelope: &BackupEnvelope) -> Result<(), String> {
    let parameters = password_lock_parameters();
    // A backup is an untrusted input. Accept exactly the costs written by this
    // format, rather than the broader legacy password-lock compatibility range.
    if envelope.format != BACKUP_FORMAT
        || envelope.kdf.memory_kib != parameters.memory_kib
        || envelope.kdf.iterations != parameters.iterations
        || envelope.kdf.parallelism != parameters.parallelism
        || envelope.salt.len() != PASSWORD_SALT_LENGTH
        || envelope.nonce.len() != NONCE_LENGTH
        || envelope.ciphertext.len() < TAG_LENGTH
        || envelope.ciphertext.len() > MAX_BACKUP_PLAINTEXT_BYTES + TAG_LENGTH
    {
        return Err("加密备份格式或加密参数不正确".to_string());
    }
    Ok(())
}

pub(crate) fn create_backup(
    vault_content: &str,
    settings_content: Option<&str>,
    password: &str,
) -> Result<String, String> {
    validate_backup_password(password)?;
    let payload = normalized_payload(vault_content, settings_content)?;
    let plaintext =
        serde_json::to_vec(&payload).map_err(|error| format!("无法编码备份内容：{error}"))?;
    if plaintext.len() > MAX_BACKUP_PLAINTEXT_BYTES {
        return Err("备份内容过大，无法生成加密备份".to_string());
    }
    let kdf = password_lock_parameters();
    let salt = Key::<Aes256Gcm>::generate().to_vec()[..PASSWORD_SALT_LENGTH].to_vec();
    let password_key = derive_password_key(password, &salt, &kdf).map_err(backup_password_error)?;
    let cipher = Aes256Gcm::new_from_slice(&password_key)
        .map_err(|error| format!("无法初始化备份加密器：{error}"))?;
    let nonce = Nonce::generate();
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: &plaintext,
                aad: BACKUP_AAD,
            },
        )
        .map_err(|_| "备份加密失败".to_string())?;
    let encoded = serde_json::to_string(&BackupEnvelope {
        format: BACKUP_FORMAT.to_string(),
        kdf,
        salt,
        nonce: nonce.to_vec(),
        ciphertext,
    })
    .map_err(|error| format!("无法编码加密备份：{error}"))?;
    if encoded.len() > MAX_BACKUP_FILE_BYTES {
        return Err("加密备份文件不能超过 100 MB".to_string());
    }
    Ok(encoded)
}

pub(crate) fn open_backup(content: &str, password: &str) -> Result<BackupContent, String> {
    if content.len() > MAX_BACKUP_FILE_BYTES {
        return Err("加密备份文件不能超过 100 MB".to_string());
    }
    validate_backup_password(password)?;
    let envelope: BackupEnvelope =
        serde_json::from_str(content).map_err(|error| format!("加密备份格式不正确：{error}"))?;
    validate_envelope(&envelope)?;
    let password_key = derive_password_key(password, &envelope.salt, &envelope.kdf)
        .map_err(backup_password_error)?;
    let cipher = Aes256Gcm::new_from_slice(&password_key)
        .map_err(|error| format!("无法初始化备份解密器：{error}"))?;
    let nonce: [u8; NONCE_LENGTH] = envelope
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| "加密备份随机数不正确".to_string())?;
    let plaintext = cipher
        .decrypt(
            (&nonce).into(),
            Payload {
                msg: &envelope.ciphertext,
                aad: BACKUP_AAD,
            },
        )
        .map_err(|_| "备份密码不正确，或备份文件已经损坏".to_string())?;
    let payload: BackupPayload = serde_json::from_slice(&plaintext)
        .map_err(|error| format!("备份内容格式不正确：{error}"))?;
    let vault_content = payload.vault.to_string();
    let settings_content = payload.settings.map(|value| value.to_string());
    let normalized = normalized_payload(&vault_content, settings_content.as_deref())?;
    Ok(BackupContent {
        vault: normalized.vault.to_string(),
        settings: normalized.settings.map(|value| value.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PASSWORD: &str = "test-backup-password";

    fn vault() -> Value {
        let device_types = json!([{
            "uuid":"11111111-1111-4111-8111-111111111111",
            "label":"测试设备", "iconText":"测", "color":"blue"
        }]);
        let history = json!([{
            "uuid":"44444444-4444-4444-8444-444444444444", "id":1,
            "password":"fictional-old-secret", "newPassword":"fictional-current-secret",
            "changedAt":"2026-11-08T00:00:00Z", "reason":"fictional history"
        }]);
        let items = json!([{
            "uuid":"22222222-2222-4222-8222-222222222222", "id":1,
            "title":"fictional-user", "deviceName":"fictional-device",
            "deviceType":"测试设备", "deviceTypeUuid":"11111111-1111-4111-8111-111111111111",
            "assetCode":"", "location":"", "username":"fictional-user",
            "password":"fictional-current-secret", "ipAddress":"example.invalid",
            "tag":"", "iconText":"测", "iconClass":"icon-blue",
            "updatedAt":"2026-11-08T00:00:00Z", "notes":"", "history":history,
            "accounts":[{
                "uuid":"33333333-3333-4333-8333-333333333333", "id":1,
                "title":"fictional-user", "username":"fictional-user",
                "password":"fictional-current-secret", "tag":"", "notes":"",
                "updatedAt":"2026-11-08T00:00:00Z", "passwordChangedAt":"2026-11-08T00:00:00Z",
                "history":history
            }]
        }]);
        json!({
            "revision": 9,
            "items": items,
            "customDeviceTypes": device_types,
            "snapshots": [{
                "id":"snapshot-1", "createdAt":"2026-11-08T00:00:00Z",
                "reason":"fictional backup test", "items":items, "customDeviceTypes":device_types
            }]
        })
    }

    fn settings() -> Value {
        json!({
            "interface":{"tooltipEnabled":true,"theme":"dark","startOnBoot":false,"startupLock":false,"autoLockMinutes":0},
            "workspace":{"rememberLayout":true,"paneLayout":{"sidebarRatio":0.14,"listRatio":0.21,"generatorRatio":0.3},"deviceSortMode":"updatedDesc","deviceTypeSortMode":"default","rememberLastView":true,"rememberWindowBounds":true,"windowBounds":null,"lastView":{"deviceType":"全部设备","searchQuery":"","sortMode":"updatedDesc","selectedDeviceUuid":""}},
            "passwordGenerator":{"length":8,"useUpper":true,"useLower":true,"useNumbers":true,"useSymbols":true,"excludeSimilar":true,"preventRepeats":false,"minimumNumbers":2,"minimumSymbols":2,"allowedSymbols":"!@","excludedCharacters":""}
        })
    }

    fn envelope() -> Value {
        json!({
            "format": BACKUP_FORMAT,
            "kdf": {"memoryKib":65536,"iterations":3,"parallelism":1},
            "salt": vec![1; PASSWORD_SALT_LENGTH],
            "nonce": vec![2; NONCE_LENGTH],
            "ciphertext": vec![3; TAG_LENGTH]
        })
    }

    #[test]
    fn round_trip_preserves_complete_vault_and_optional_settings() {
        let source_vault = vault();
        let source_settings = settings();
        let encoded = create_backup(
            &source_vault.to_string(),
            Some(&source_settings.to_string()),
            PASSWORD,
        )
        .unwrap();
        assert!(!encoded.contains("fictional backup test"));
        assert!(!encoded.contains("fictional-current-secret"));
        assert!(!encoded.contains("fictional-old-secret"));
        assert!(!encoded.contains("passwordGenerator"));
        assert!(!encoded.contains("vault.key"));
        let restored = open_backup(&encoded, PASSWORD).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&restored.vault).unwrap(),
            source_vault
        );
        assert_eq!(
            serde_json::from_str::<Value>(&restored.settings.unwrap()).unwrap(),
            source_settings
        );
        let encoded = create_backup(&source_vault.to_string(), None, PASSWORD).unwrap();
        assert!(open_backup(&encoded, PASSWORD).unwrap().settings.is_none());
    }

    #[test]
    fn wrong_password_and_ciphertext_tampering_never_return_content() {
        let encoded = create_backup(&vault().to_string(), None, PASSWORD).unwrap();
        assert!(open_backup(&encoded, "wrong-backup-password")
            .unwrap_err()
            .contains("备份密码不正确"));
        let mut corrupted: Value = serde_json::from_str(&encoded).unwrap();
        let byte = corrupted["ciphertext"][0].as_u64().unwrap();
        corrupted["ciphertext"][0] = json!(byte ^ 1);
        assert!(open_backup(&corrupted.to_string(), PASSWORD)
            .unwrap_err()
            .contains("备份密码不正确"));
    }

    #[test]
    fn every_backup_uses_new_salt_nonce_and_ciphertext() {
        let first = create_backup(&vault().to_string(), None, PASSWORD).unwrap();
        let second = create_backup(&vault().to_string(), None, PASSWORD).unwrap();
        let first: Value = serde_json::from_str(&first).unwrap();
        let second: Value = serde_json::from_str(&second).unwrap();
        for field in ["salt", "nonce", "ciphertext"] {
            assert_ne!(first[field], second[field], "{field}");
        }
    }

    #[test]
    fn invalid_envelope_fields_are_rejected_before_key_derivation() {
        for (pointer, invalid) in [
            ("/format", json!("another-application")),
            ("/kdf/memoryKib", json!(524288)),
            ("/kdf/memoryKib", json!(8192)),
            ("/kdf/iterations", json!(12)),
            ("/kdf/parallelism", json!(8)),
            ("/salt", json!([1, 2, 3])),
            ("/nonce", json!([1, 2, 3])),
            ("/ciphertext", json!([1, 2, 3])),
        ] {
            let mut value = envelope();
            *value.pointer_mut(pointer).unwrap() = invalid;
            assert_eq!(
                open_backup(&value.to_string(), PASSWORD).unwrap_err(),
                "加密备份格式或加密参数不正确",
                "{pointer}"
            );
        }
        let mut value = envelope();
        value["unknown"] = json!(true);
        assert!(open_backup(&value.to_string(), PASSWORD)
            .unwrap_err()
            .contains("unknown field"));
        let mut value = envelope();
        value["kdf"]["unknown"] = json!(true);
        assert!(open_backup(&value.to_string(), PASSWORD)
            .unwrap_err()
            .contains("unknown field"));
    }

    #[test]
    fn size_limits_are_checked_before_parsing_or_derivation() {
        let oversized = " ".repeat(MAX_BACKUP_FILE_BYTES + 1);
        assert_eq!(
            open_backup(&oversized, PASSWORD).unwrap_err(),
            "加密备份文件不能超过 100 MB"
        );
        assert!(create_backup(&oversized, None, PASSWORD)
            .unwrap_err()
            .contains("备份内容过大"));
        let invalid = BackupEnvelope {
            format: BACKUP_FORMAT.to_string(),
            kdf: password_lock_parameters(),
            salt: vec![1; PASSWORD_SALT_LENGTH],
            nonce: vec![2; NONCE_LENGTH],
            ciphertext: vec![3; MAX_BACKUP_PLAINTEXT_BYTES + TAG_LENGTH + 1],
        };
        assert!(validate_envelope(&invalid).is_err());
    }

    #[test]
    fn source_data_and_password_policy_are_validated() {
        assert!(create_backup("{}", None, PASSWORD).is_err());
        assert!(create_backup(&vault().to_string(), Some("{}"), PASSWORD).is_err());
        for password in ["short", "1234567\n"] {
            let error = create_backup(&vault().to_string(), None, password).unwrap_err();
            assert!(error.contains("备份密码"));
            assert!(!error.contains("主密码"));
        }
        assert!(validate_backup_password(&"密".repeat(8)).is_ok());
        assert!(validate_backup_password(&"密".repeat(257)).is_err());
    }

    #[test]
    fn authenticated_payload_still_requires_strict_content_validation() {
        let kdf = password_lock_parameters();
        let salt = vec![4; PASSWORD_SALT_LENGTH];
        let password_key = derive_password_key(PASSWORD, &salt, &kdf).unwrap();
        let cipher = Aes256Gcm::new_from_slice(&password_key).unwrap();
        for payload in [
            json!({"vault":vault(),"settings":null,"unknown":true}),
            json!({"vault":{},"settings":null}),
            json!({"vault":vault(),"settings":{}}),
        ] {
            let nonce = Nonce::generate();
            let ciphertext = cipher
                .encrypt(
                    &nonce,
                    Payload {
                        msg: payload.to_string().as_bytes(),
                        aad: BACKUP_AAD,
                    },
                )
                .unwrap();
            let encoded = serde_json::to_string(&BackupEnvelope {
                format: BACKUP_FORMAT.to_string(),
                kdf: password_lock_parameters(),
                salt: salt.clone(),
                nonce: nonce.to_vec(),
                ciphertext,
            })
            .unwrap();
            assert!(open_backup(&encoded, PASSWORD).is_err());
        }
    }
}
