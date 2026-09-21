use crate::password_kdf::PASSWORD_KEY_LENGTH;
use serde::{Deserialize, Serialize};

const RECOVERY_KEY_PREFIX: &str = "PSDM-";
const RECOVERY_FILE_FORMAT: &str = "psd-manager-recovery";
const RECOVERY_FILE_VERSION: u8 = 1;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct RecoveryFilePayload {
    format: String,
    version: u8,
    recovery_key: String,
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn format_recovery_key(secret: &[u8]) -> Result<String, String> {
    if secret.len() != PASSWORD_KEY_LENGTH {
        return Err("恢复密钥长度不正确".to_string());
    }
    let hex = encode_hex(secret);
    let groups = hex
        .as_bytes()
        .chunks(8)
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect::<Vec<_>>();
    Ok(format!("{RECOVERY_KEY_PREFIX}{}", groups.join("-")))
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    let normalized = value
        .trim()
        .strip_prefix(RECOVERY_KEY_PREFIX)
        .unwrap_or(value.trim())
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && *character != '-')
        .collect::<String>();
    if normalized.len() != PASSWORD_KEY_LENGTH * 2
        || !normalized
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("恢复密钥格式不正确".to_string());
    }
    let mut bytes = Vec::with_capacity(PASSWORD_KEY_LENGTH);
    let characters = normalized.as_bytes();
    for pair in characters.chunks_exact(2) {
        let high = (pair[0] as char)
            .to_digit(16)
            .ok_or_else(|| "恢复密钥格式不正确".to_string())?;
        let low = (pair[1] as char)
            .to_digit(16)
            .ok_or_else(|| "恢复密钥格式不正确".to_string())?;
        bytes.push(((high << 4) | low) as u8);
    }
    Ok(bytes)
}

pub(crate) fn parse_recovery_file(content: &str) -> Result<Vec<u8>, String> {
    let trimmed = content.trim();
    let payload: RecoveryFilePayload = match serde_json::from_str(trimmed) {
        Ok(payload) => payload,
        Err(_error) if trimmed.starts_with(RECOVERY_KEY_PREFIX) => return decode_hex(trimmed),
        Err(error) => return Err(format!("恢复文件格式不正确：{error}")),
    };
    if payload.format != RECOVERY_FILE_FORMAT || payload.version != RECOVERY_FILE_VERSION {
        return Err("不支持的恢复文件格式或版本".to_string());
    }
    decode_hex(&payload.recovery_key)
}

pub(crate) fn format_recovery_file(secret: &[u8]) -> Result<String, String> {
    let payload = RecoveryFilePayload {
        format: RECOVERY_FILE_FORMAT.to_string(),
        version: RECOVERY_FILE_VERSION,
        recovery_key: format_recovery_key(secret)?,
    };
    serde_json::to_string_pretty(&payload)
        .map(|content| format!("{content}\n"))
        .map_err(|error| format!("无法生成恢复文件：{error}"))
}

#[cfg(test)]
mod recovery_format_tests {
    use super::*;
    #[test]
    fn recovery_file_and_manual_key_round_trip() {
        let secret: Vec<u8> = (0..32).collect();
        let file = format_recovery_file(&secret).unwrap();
        assert!(file.ends_with('\n'));
        assert_eq!(parse_recovery_file(&file).unwrap(), secret);
        assert_eq!(
            parse_recovery_file(&format_recovery_key(&secret).unwrap()).unwrap(),
            secret
        );
    }
    #[test]
    fn invalid_recovery_schema_and_keys_are_rejected() {
        let mut file: serde_json::Value =
            serde_json::from_str(&format_recovery_file(&[1; 32]).unwrap()).unwrap();
        file["version"] = serde_json::json!(2);
        assert!(parse_recovery_file(&file.to_string()).is_err());
        file["version"] = serde_json::json!(1);
        file["extra"] = serde_json::json!(true);
        assert!(parse_recovery_file(&file.to_string()).is_err());
        assert!(parse_recovery_file("PSDM-ABC").is_err());
        assert!(format_recovery_file(&[1; 31]).is_err());
    }
}
