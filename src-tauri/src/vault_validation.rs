use serde_json::Value;

const VAULT_SCHEMA_VERSION: u64 = 2;

pub(crate) fn is_valid_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
        && matches!(bytes[14], b'1'..=b'8')
        && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
}

fn require_object<'a>(
    value: &'a Value,
    path: &str,
) -> Result<&'a serde_json::Map<String, Value>, String> {
    value.as_object().ok_or_else(|| format!("{path}必须是对象"))
}

fn reject_unknown_fields(
    object: &serde_json::Map<String, Value>,
    path: &str,
    allowed: &[&str],
) -> Result<(), String> {
    if let Some(field) = object
        .keys()
        .find(|field| !allowed.contains(&field.as_str()))
    {
        return Err(format!("{path}包含当前格式不支持的字段 {field}"));
    }
    Ok(())
}

fn require_value<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a Value, String> {
    object
        .get(key)
        .ok_or_else(|| format!("{path}缺少字段 {key}"))
}

fn require_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<String, String> {
    require_value(object, key, path)?
        .as_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("{path}.{key}必须是文本"))
}

fn validate_text_value(
    value: &str,
    path: &str,
    maximum: usize,
    allow_line_breaks: bool,
) -> Result<(), String> {
    if value.chars().count() > maximum {
        return Err(format!("{path}不能超过 {maximum} 个字符"));
    }
    if value.chars().any(|character| {
        is_invisible_control_character(character)
            && !(allow_line_breaks && (character == '\n' || character == '\r'))
    }) {
        return Err(format!("{path}不能包含不可见控制字符"));
    }
    Ok(())
}

fn is_invisible_control_character(character: char) -> bool {
    character.is_control()
        || matches!(
            character,
            '\u{200b}'..='\u{200f}'
                | '\u{202a}'..='\u{202e}'
                | '\u{2060}'..='\u{206f}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{feff}'
        )
}

fn validate_password_value(value: &str, path: &str) -> Result<(), String> {
    // Passwords already stored in a vault can come from older versions or
    // another manager, so ordinary Unicode, spaces, and full-width symbols
    // must remain readable. New password forms enforce their own input rule.
    validate_text_value(value, path, 1024, false)?;
    Ok(())
}

fn require_text_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    path: &str,
    maximum: usize,
    allow_line_breaks: bool,
) -> Result<String, String> {
    let value = require_string_field(object, key, path)?;
    validate_text_value(&value, &format!("{path}.{key}"), maximum, allow_line_breaks)?;
    Ok(value)
}

fn require_password_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<String, String> {
    let value = require_string_field(object, key, path)?;
    validate_password_value(&value, &format!("{path}.{key}"))?;
    Ok(value)
}

fn require_connection_address_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<String, String> {
    let value = require_string_field(object, key, path)?;
    validate_text_value(&value, &format!("{path}.{key}"), 2048, false)?;
    if value.chars().any(char::is_whitespace) {
        return Err(format!("{path}.{key}不能包含空白字符"));
    }
    Ok(value)
}

fn require_integer_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<u64, String> {
    let value = require_value(object, key, path)?
        .as_u64()
        .ok_or_else(|| format!("{path}.{key}必须是非负整数"))?;
    if value > 9_007_199_254_740_991 {
        return Err(format!("{path}.{key}超出安全整数范围"));
    }
    Ok(value)
}

fn require_array_field<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a Vec<Value>, String> {
    require_value(object, key, path)?
        .as_array()
        .ok_or_else(|| format!("{path}.{key}必须是数组"))
}

fn validate_history_payload(
    value: &Value,
    path: &str,
    used_uuids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let entries = value
        .as_array()
        .ok_or_else(|| format!("{path}必须是数组"))?;
    let mut ids = std::collections::HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        let entry_path = format!("{path}[{index}]");
        let object = require_object(entry, &entry_path)?;
        reject_unknown_fields(
            object,
            &entry_path,
            &[
                "uuid",
                "id",
                "password",
                "newPassword",
                "changedAt",
                "reason",
            ],
        )?;
        let uuid = require_string_field(object, "uuid", &entry_path)?.to_lowercase();
        if !is_valid_uuid(&uuid) || !used_uuids.insert(uuid) {
            return Err(format!("{entry_path}.uuid无效或重复"));
        }
        let id = require_integer_field(object, "id", &entry_path)?;
        if id == 0 || !ids.insert(id) {
            return Err(format!("{entry_path}.id无效或重复"));
        }
        let _ = require_password_field(object, "password", &entry_path)?;
        let _ = require_password_field(object, "newPassword", &entry_path)?;
        let _ = require_text_field(object, "changedAt", &entry_path, 64, false)?;
        let _ = require_text_field(object, "reason", &entry_path, 200, false)?;
    }
    Ok(())
}

fn validate_accounts_payload(
    value: &Value,
    path: &str,
    account_uuids: &mut std::collections::HashSet<String>,
    history_uuids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let entries = value
        .as_array()
        .ok_or_else(|| format!("{path}必须是数组"))?;
    let mut ids = std::collections::HashSet::new();
    let mut usernames = std::collections::HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        let entry_path = format!("{path}[{index}]");
        let object = require_object(entry, &entry_path)?;
        reject_unknown_fields(
            object,
            &entry_path,
            &[
                "uuid",
                "id",
                "title",
                "username",
                "password",
                "tag",
                "notes",
                "updatedAt",
                "passwordChangedAt",
                "history",
            ],
        )?;
        let uuid = require_string_field(object, "uuid", &entry_path)?.to_lowercase();
        if !is_valid_uuid(&uuid) || !account_uuids.insert(uuid) {
            return Err(format!("{entry_path}.uuid无效或重复"));
        }
        let id = require_integer_field(object, "id", &entry_path)?;
        if id == 0 || !ids.insert(id) {
            return Err(format!("{entry_path}.id无效或重复"));
        }
        let username = require_text_field(object, "username", &entry_path, 120, false)?
            .trim()
            .to_owned();
        if username.is_empty() || !usernames.insert(username) {
            return Err(format!("{path}存在空用户名或重复用户名"));
        }
        let _ = require_text_field(object, "title", &entry_path, 120, false)?;
        let _ = require_password_field(object, "password", &entry_path)?;
        let _ = require_text_field(object, "tag", &entry_path, 40, false)?;
        let _ = require_text_field(object, "notes", &entry_path, 2000, true)?;
        let _ = require_text_field(object, "updatedAt", &entry_path, 64, false)?;
        let _ = require_text_field(object, "passwordChangedAt", &entry_path, 64, false)?;
        validate_history_payload(
            require_value(object, "history", &entry_path)?,
            &format!("{entry_path}.history"),
            history_uuids,
        )?;
    }
    Ok(())
}

fn validate_device_types_payload(
    value: &Value,
    path: &str,
) -> Result<std::collections::HashMap<String, String>, String> {
    let entries = value
        .as_array()
        .ok_or_else(|| format!("{path}必须是数组"))?;
    let mut labels = std::collections::HashSet::new();
    let mut uuids = std::collections::HashSet::new();
    let mut by_label = std::collections::HashMap::new();
    for (index, entry) in entries.iter().enumerate() {
        let entry_path = format!("{path}[{index}]");
        let object = require_object(entry, &entry_path)?;
        reject_unknown_fields(object, &entry_path, &["uuid", "label", "iconText", "color"])?;
        let uuid = require_string_field(object, "uuid", &entry_path)?.to_lowercase();
        let label = require_text_field(object, "label", &entry_path, 40, false)?
            .trim()
            .to_owned();
        if !is_valid_uuid(&uuid)
            || !uuids.insert(uuid.clone())
            || label.is_empty()
            || !labels.insert(label.clone())
        {
            return Err(format!("{entry_path}的 UUID 或名称无效或重复"));
        }
        let icon_text = require_text_field(object, "iconText", &entry_path, 2, false)?;
        if icon_text.trim().is_empty() {
            return Err(format!("{entry_path}.iconText不能为空"));
        }
        let color = require_string_field(object, "color", &entry_path)?.to_lowercase();
        let valid_named_color =
            ["blue", "cyan", "rose", "indigo", "sand", "gold", "dark"].contains(&color.as_str());
        let valid_hex_color = color.len() == 7
            && color.starts_with('#')
            && color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit);
        if !valid_named_color && !valid_hex_color {
            return Err(format!("{entry_path}.color不是有效颜色"));
        }
        by_label.insert(label, uuid);
    }
    Ok(by_label)
}

fn validate_items_payload(
    value: &Value,
    path: &str,
    device_types: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let entries = value
        .as_array()
        .ok_or_else(|| format!("{path}必须是数组"))?;
    let mut ids = std::collections::HashSet::new();
    let mut names = std::collections::HashSet::new();
    let mut device_uuids = std::collections::HashSet::new();
    let mut account_uuids = std::collections::HashSet::new();
    let mut history_uuids = std::collections::HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        let entry_path = format!("{path}[{index}]");
        let object = require_object(entry, &entry_path)?;
        reject_unknown_fields(
            object,
            &entry_path,
            &[
                "uuid",
                "id",
                "title",
                "deviceName",
                "deviceType",
                "deviceTypeUuid",
                "assetCode",
                "location",
                "username",
                "password",
                "ipAddress",
                "tag",
                "iconText",
                "iconClass",
                "updatedAt",
                "notes",
                "history",
                "accounts",
            ],
        )?;
        let uuid = require_string_field(object, "uuid", &entry_path)?.to_lowercase();
        let id = require_integer_field(object, "id", &entry_path)?;
        let device_name = require_text_field(object, "deviceName", &entry_path, 120, false)?
            .trim()
            .to_owned();
        let device_type = require_text_field(object, "deviceType", &entry_path, 40, false)?
            .trim()
            .to_owned();
        if !is_valid_uuid(&uuid)
            || !device_uuids.insert(uuid)
            || id == 0
            || !ids.insert(id)
            || device_name.is_empty()
            || device_type.is_empty()
            || !names.insert(format!("{device_type}\u{0}{device_name}"))
        {
            return Err(format!("{entry_path}的 UUID、ID 或名称无效或重复"));
        }
        let device_type_uuid =
            require_string_field(object, "deviceTypeUuid", &entry_path)?.to_lowercase();
        if !is_valid_uuid(&device_type_uuid)
            || device_types.get(&device_type) != Some(&device_type_uuid)
        {
            return Err(format!("{entry_path}.deviceTypeUuid与设备类型不匹配"));
        }
        let _ = require_text_field(object, "title", &entry_path, 120, false)?;
        let _ = require_text_field(object, "assetCode", &entry_path, 80, false)?;
        let _ = require_text_field(object, "location", &entry_path, 120, false)?;
        let _ = require_text_field(object, "username", &entry_path, 120, false)?;
        let _ = require_password_field(object, "password", &entry_path)?;
        let _ = require_connection_address_field(object, "ipAddress", &entry_path)?;
        let _ = require_text_field(object, "tag", &entry_path, 40, false)?;
        let icon_text = require_text_field(object, "iconText", &entry_path, 2, false)?;
        if icon_text.trim().is_empty() {
            return Err(format!("{entry_path}.iconText不能为空"));
        }
        let _ = require_text_field(object, "iconClass", &entry_path, 64, false)?;
        let _ = require_text_field(object, "updatedAt", &entry_path, 64, false)?;
        let _ = require_text_field(object, "notes", &entry_path, 2000, true)?;
        // Device history is a denormalized mirror and intentionally has its own UUID scope.
        let mut device_history_uuids = std::collections::HashSet::new();
        validate_history_payload(
            require_value(object, "history", &entry_path)?,
            &format!("{entry_path}.history"),
            &mut device_history_uuids,
        )?;
        validate_accounts_payload(
            require_value(object, "accounts", &entry_path)?,
            &format!("{entry_path}.accounts"),
            &mut account_uuids,
            &mut history_uuids,
        )?;
    }
    Ok(())
}

pub(crate) fn validate_vault_payload(content: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(content).map_err(|error| format!("资产库内容格式不正确：{error}"))?;
    let object = require_object(&value, "资产库")?;
    reject_unknown_fields(
        object,
        "资产库",
        &[
            "schemaVersion",
            "revision",
            "items",
            "customDeviceTypes",
            "snapshots",
        ],
    )?;
    let version = require_integer_field(object, "schemaVersion", "资产库")?;
    if version != VAULT_SCHEMA_VERSION {
        return Err(format!(
            "不支持资产库数据版本 {version}，当前仅支持 {VAULT_SCHEMA_VERSION}"
        ));
    }
    let _ = require_integer_field(object, "revision", "资产库")?;
    let device_types = validate_device_types_payload(
        require_value(object, "customDeviceTypes", "资产库")?,
        "customDeviceTypes",
    )?;
    validate_items_payload(
        require_value(object, "items", "资产库")?,
        "items",
        &device_types,
    )?;
    let snapshots = require_array_field(object, "snapshots", "资产库")?;
    if snapshots.len() > 10 {
        return Err("资产库最多保留 10 个数据快照".to_string());
    }
    let mut snapshot_ids = std::collections::HashSet::new();
    for (index, snapshot) in snapshots.iter().enumerate() {
        let path = format!("snapshots[{index}]");
        let snapshot_object = require_object(snapshot, &path)?;
        reject_unknown_fields(
            snapshot_object,
            &path,
            &["id", "createdAt", "reason", "items", "customDeviceTypes"],
        )?;
        let snapshot_id = require_text_field(snapshot_object, "id", &path, 128, false)?;
        if snapshot_id.is_empty() || !snapshot_ids.insert(snapshot_id) {
            return Err(format!("{path}.id无效或重复"));
        }
        let _ = require_text_field(snapshot_object, "createdAt", &path, 64, false)?;
        let _ = require_text_field(snapshot_object, "reason", &path, 200, false)?;
        let snapshot_types = validate_device_types_payload(
            require_value(snapshot_object, "customDeviceTypes", &path)?,
            &format!("{path}.customDeviceTypes"),
        )?;
        validate_items_payload(
            require_value(snapshot_object, "items", &path)?,
            &format!("{path}.items"),
            &snapshot_types,
        )?;
    }
    Ok(value)
}

#[cfg(test)]
mod vault_validation_tests {
    use super::*;
    use serde_json::json;

    fn empty_vault() -> Value {
        json!({"schemaVersion": 2, "revision": 0, "items": [], "customDeviceTypes": [], "snapshots": []})
    }

    #[test]
    fn current_empty_vault_is_valid_but_missing_and_unknown_fields_are_not() {
        let value = empty_vault();
        assert_eq!(validate_vault_payload(&value.to_string()).unwrap(), value);
        let mut missing = value.clone();
        missing.as_object_mut().unwrap().remove("items");
        assert!(validate_vault_payload(&missing.to_string())
            .unwrap_err()
            .contains("缺少字段 items"));
        let mut unknown = value;
        unknown["legacy"] = json!(true);
        assert!(validate_vault_payload(&unknown.to_string())
            .unwrap_err()
            .contains("不支持的字段 legacy"));
    }

    #[test]
    fn schema_revision_and_snapshot_limits_are_enforced() {
        let mut value = empty_vault();
        value["schemaVersion"] = json!(1);
        assert!(validate_vault_payload(&value.to_string()).is_err());
        value = empty_vault();
        value["revision"] = json!(9007199254740992_u64);
        assert!(validate_vault_payload(&value.to_string())
            .unwrap_err()
            .contains("安全整数"));
        value = empty_vault();
        value["snapshots"] = json!(vec![json!({}); 11]);
        assert!(validate_vault_payload(&value.to_string())
            .unwrap_err()
            .contains("10 个"));
    }

    #[test]
    fn stored_unicode_passwords_are_readable_but_controls_are_rejected() {
        assert!(validate_password_value("旧密码 😀 空格", "password").is_ok());
        assert!(validate_password_value("bad\nvalue", "password").is_err());
        assert!(validate_password_value("bad\u{200b}value", "password").is_err());
        assert!(validate_text_value("两字", "name", 2, false).is_ok());
        assert!(validate_text_value("三字符", "name", 2, false).is_err());
        assert!(validate_text_value("两\n行", "notes", 3, true).is_ok());
    }
}

pub(crate) fn vault_revision(value: &Value) -> u64 {
    value.get("revision").and_then(Value::as_u64).unwrap_or(0)
}
