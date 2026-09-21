use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};

pub(crate) const PASSWORD_SALT_LENGTH: usize = 16;
pub(crate) const PASSWORD_KEY_LENGTH: usize = 32;
const PASSWORD_MIN_LENGTH: usize = 8;
const PASSWORD_MAX_LENGTH: usize = 256;
const PASSWORD_KDF_MEMORY_KIB: u32 = 64 * 1024;
const PASSWORD_KDF_ITERATIONS: u32 = 3;
const PASSWORD_KDF_PARALLELISM: u32 = 1;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PasswordKdfParameters {
    pub(crate) memory_kib: u32,
    pub(crate) iterations: u32,
    pub(crate) parallelism: u32,
}

pub(crate) fn password_lock_parameters() -> PasswordKdfParameters {
    PasswordKdfParameters {
        memory_kib: PASSWORD_KDF_MEMORY_KIB,
        iterations: PASSWORD_KDF_ITERATIONS,
        parallelism: PASSWORD_KDF_PARALLELISM,
    }
}

pub(crate) fn validate_master_password(password: &str) -> Result<(), String> {
    let length = password.chars().count();
    if length < PASSWORD_MIN_LENGTH {
        return Err(format!("主密码至少需要 {PASSWORD_MIN_LENGTH} 个字符"));
    }
    if length > PASSWORD_MAX_LENGTH {
        return Err(format!("主密码不能超过 {PASSWORD_MAX_LENGTH} 个字符"));
    }
    if password.chars().any(char::is_control) {
        return Err("主密码不能包含控制字符".to_string());
    }
    Ok(())
}

pub(crate) fn derive_password_key(
    password: &str,
    salt: &[u8],
    parameters: &PasswordKdfParameters,
) -> Result<Vec<u8>, String> {
    validate_password_kdf_parameters(salt, parameters)?;
    let params = Params::new(
        parameters.memory_kib,
        parameters.iterations,
        parameters.parallelism,
        Some(PASSWORD_KEY_LENGTH),
    )
    .map_err(|error| format!("无法初始化主密码派生参数：{error}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = vec![0u8; PASSWORD_KEY_LENGTH];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| format!("主密码派生失败：{error}"))?;
    Ok(key)
}

pub(crate) fn validate_password_kdf_parameters(
    salt: &[u8],
    parameters: &PasswordKdfParameters,
) -> Result<(), String> {
    if salt.len() != PASSWORD_SALT_LENGTH
        || parameters.memory_kib < 8 * 1024
        || parameters.memory_kib > 512 * 1024
        || parameters.iterations == 0
        || parameters.iterations > 12
        || parameters.parallelism == 0
        || parameters.parallelism > 8
    {
        return Err("主密码加密参数不正确".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod password_policy_tests {
    use super::*;

    #[test]
    fn master_password_counts_unicode_characters_and_rejects_controls() {
        assert!(validate_master_password(&"密".repeat(8)).is_ok());
        assert!(validate_master_password(&"密".repeat(7)).is_err());
        assert!(validate_master_password(&"a".repeat(256)).is_ok());
        assert!(validate_master_password(&"a".repeat(257)).is_err());
        assert!(validate_master_password("1234567\n").is_err());
    }

    #[test]
    fn kdf_limits_reject_untrusted_parameters_before_derivation() {
        let valid = password_lock_parameters();
        assert!(validate_password_kdf_parameters(&[0; 16], &valid).is_ok());
        for length in [0, 15, 17] {
            assert!(validate_password_kdf_parameters(&vec![0; length], &valid).is_err());
        }
        for (memory_kib, iterations, parallelism) in [
            (8191, 3, 1),
            (524289, 3, 1),
            (8192, 0, 1),
            (8192, 13, 1),
            (8192, 1, 0),
            (8192, 1, 9),
        ] {
            let parameters = PasswordKdfParameters {
                memory_kib,
                iterations,
                parallelism,
            };
            assert!(derive_password_key("test-password", &[0; 16], &parameters).is_err());
        }
    }

    #[test]
    fn key_derivation_is_repeatable_and_salt_specific() {
        // Lowest accepted cost keeps this compatibility test bounded; defaults
        // remain unchanged and are validated separately.
        let parameters = PasswordKdfParameters {
            memory_kib: 8192,
            iterations: 1,
            parallelism: 1,
        };
        let first = derive_password_key("test-password", &[1; 16], &parameters).unwrap();
        let repeated = derive_password_key("test-password", &[1; 16], &parameters).unwrap();
        let other = derive_password_key("test-password", &[2; 16], &parameters).unwrap();
        assert_eq!(first.len(), 32);
        assert_eq!(first, repeated);
        assert_ne!(first, other);
    }
}
