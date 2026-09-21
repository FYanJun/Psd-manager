use crate::password_kdf::{
    derive_password_key, password_lock_parameters, validate_master_password, PasswordKdfParameters,
    PASSWORD_KEY_LENGTH, PASSWORD_SALT_LENGTH,
};
use aes_gcm::{
    aead::{Aead, Generate, Key, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use serde::{Deserialize, Serialize};

const VAULT_PASSWORD_AAD: &[u8] = b"com.fan.psd-manager:vault-password:1";
const VAULT_RECOVERY_AAD: &[u8] = b"com.fan.psd-manager:vault-recovery:1";
pub(crate) const PASSWORD_LOCK_VERSION: u8 = 1;
pub(crate) const PASSWORD_NONCE_LENGTH: usize = 12;
pub(crate) const PASSWORD_TAG_LENGTH: usize = 16;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PasswordLockFile {
    pub(crate) version: u8,
    pub(crate) kdf: PasswordKdfParameters,
    pub(crate) salt: Vec<u8>,
    pub(crate) nonce: Vec<u8>,
    pub(crate) wrapped_key: Vec<u8>,
    #[serde(default)]
    pub(crate) recovery_nonce: Vec<u8>,
    #[serde(default)]
    pub(crate) recovery_wrapped_key: Vec<u8>,
}

pub(crate) fn wrap_vault_key(
    vault_key: &[u8],
    password: &str,
) -> Result<(PasswordLockFile, Vec<u8>), String> {
    validate_master_password(password)?;
    if vault_key.len() != PASSWORD_KEY_LENGTH {
        return Err("资产库密钥长度不正确".to_string());
    }
    let kdf = password_lock_parameters();
    let salt = Key::<Aes256Gcm>::generate().to_vec()[..PASSWORD_SALT_LENGTH].to_vec();
    let password_key = derive_password_key(password, &salt, &kdf)?;
    let cipher = Aes256Gcm::new_from_slice(&password_key)
        .map_err(|error| format!("无法初始化主密码加密器：{error}"))?;
    let nonce = Nonce::generate();
    let wrapped_key = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: vault_key,
                aad: VAULT_PASSWORD_AAD,
            },
        )
        .map_err(|_| "无法使用主密码保护资产库密钥".to_string())?;
    let recovery_secret = new_recovery_secret();
    let (recovery_nonce, recovery_wrapped_key) =
        wrap_vault_key_with_recovery(vault_key, &recovery_secret)?;
    Ok((
        PasswordLockFile {
            version: PASSWORD_LOCK_VERSION,
            kdf,
            salt,
            nonce: nonce.to_vec(),
            wrapped_key,
            recovery_nonce,
            recovery_wrapped_key,
        },
        recovery_secret,
    ))
}

pub(crate) fn unwrap_vault_key(
    lock_file: &PasswordLockFile,
    password: &str,
) -> Result<Vec<u8>, String> {
    validate_master_password(password)?;
    let password_key = derive_password_key(password, &lock_file.salt, &lock_file.kdf)?;
    let cipher = Aes256Gcm::new_from_slice(&password_key)
        .map_err(|error| format!("无法初始化主密码解密器：{error}"))?;
    let nonce: [u8; PASSWORD_NONCE_LENGTH] = lock_file
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| "启动密码随机数格式不正确".to_string())?;
    let key = cipher
        .decrypt(
            (&nonce).into(),
            Payload {
                msg: lock_file.wrapped_key.as_ref(),
                aad: VAULT_PASSWORD_AAD,
            },
        )
        .map_err(|_| "主密码不正确".to_string())?;
    if key.len() != PASSWORD_KEY_LENGTH {
        return Err("解锁得到的资产库密钥长度不正确".to_string());
    }
    Ok(key)
}

fn wrap_vault_key_with_recovery(
    vault_key: &[u8],
    recovery_secret: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), String> {
    if vault_key.len() != PASSWORD_KEY_LENGTH || recovery_secret.len() != PASSWORD_KEY_LENGTH {
        return Err("恢复密钥长度不正确".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(recovery_secret)
        .map_err(|error| format!("无法初始化恢复密钥加密器：{error}"))?;
    let nonce = Nonce::generate();
    let wrapped_key = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: vault_key,
                aad: VAULT_RECOVERY_AAD,
            },
        )
        .map_err(|_| "无法使用恢复密钥保护资产库密钥".to_string())?;
    Ok((nonce.to_vec(), wrapped_key))
}

pub(crate) fn unwrap_vault_key_with_recovery(
    lock_file: &PasswordLockFile,
    recovery_secret: &[u8],
) -> Result<Vec<u8>, String> {
    if lock_file.recovery_nonce.len() != PASSWORD_NONCE_LENGTH
        || lock_file.recovery_wrapped_key.len() != PASSWORD_KEY_LENGTH + PASSWORD_TAG_LENGTH
    {
        return Err("当前资产库没有可用的恢复密钥".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(recovery_secret)
        .map_err(|error| format!("无法初始化恢复密钥解密器：{error}"))?;
    let nonce: [u8; PASSWORD_NONCE_LENGTH] = lock_file
        .recovery_nonce
        .as_slice()
        .try_into()
        .map_err(|_| "恢复密钥随机数格式不正确".to_string())?;
    let key = cipher
        .decrypt(
            (&nonce).into(),
            Payload {
                msg: lock_file.recovery_wrapped_key.as_ref(),
                aad: VAULT_RECOVERY_AAD,
            },
        )
        .map_err(|_| "恢复密钥不正确或已经失效".to_string())?;
    if key.len() != PASSWORD_KEY_LENGTH {
        return Err("恢复密钥得到的资产库密钥长度不正确".to_string());
    }
    Ok(key)
}

fn new_recovery_secret() -> Vec<u8> {
    Key::<Aes256Gcm>::generate().to_vec()
}

#[cfg(test)]
mod key_wrap_tests {
    use super::*;
    #[test]
    fn password_and_recovery_unwrap_authenticate_and_reject_tampering() {
        let key = vec![42; PASSWORD_KEY_LENGTH];
        let (mut lock, recovery) = wrap_vault_key(&key, "test-password").unwrap();
        assert_eq!(unwrap_vault_key(&lock, "test-password").unwrap(), key);
        assert!(unwrap_vault_key(&lock, "wrong-password").is_err());
        assert_eq!(
            unwrap_vault_key_with_recovery(&lock, &recovery).unwrap(),
            key
        );
        assert!(unwrap_vault_key_with_recovery(&lock, &[0; 32]).is_err());
        lock.wrapped_key[0] ^= 1;
        assert!(unwrap_vault_key(&lock, "test-password").is_err());
        lock.recovery_wrapped_key[0] ^= 1;
        assert!(unwrap_vault_key_with_recovery(&lock, &recovery).is_err());
        lock.recovery_nonce.clear();
        assert!(unwrap_vault_key_with_recovery(&lock, &recovery).is_err());
    }
    #[test]
    fn wrapping_rejects_invalid_key_lengths() {
        assert!(wrap_vault_key(&[0; 31], "test-password").is_err());
        assert!(wrap_vault_key_with_recovery(&[0; 32], &[1; 31]).is_err());
        assert!(wrap_vault_key_with_recovery(&[0; 31], &[1; 32]).is_err());
    }
}
