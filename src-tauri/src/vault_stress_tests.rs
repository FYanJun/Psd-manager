//! Opt-in pressure tests using synthetic records in fresh temporary directories.
use crate::encrypted_backup::{create_backup, open_backup};
use crate::vault_read::{
    decrypt_vault_file, load_existing_vault, load_valid_vault_file, VaultSource,
};
use crate::vault_validation::validate_vault_payload;
use crate::vault_write::save_payload;
use crate::{BACKUP_RECOVERY_REQUIRED, VAULT_BACKUP_FILE_NAME, VAULT_FILE_NAME};
use aes_gcm::{
    aead::{Generate, Key},
    Aes256Gcm,
};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Instant};

struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let nonce = Key::<Aes256Gcm>::generate();
        let token = nonce.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let path = std::env::temp_dir().join(format!("psd-vault-stress-{token}"));
        fs::create_dir(&path).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn uuid(kind: u32, id: usize) -> String {
    format!("{kind:08x}-0000-4000-8000-{id:012x}")
}
fn fixture(count: usize) -> Value {
    let items = (0..count)
        .map(|index| {
            let accounts =
                (0..2)
                    .map(|account| {
                        let aid = index * 2 + account + 1;
                        let history = (0..3).map(|entry| json!({
                "id": entry + 1, "uuid": uuid(3, aid * 3 + entry),
                "password": format!("虚构旧密码🔑 {aid}-{entry}"),
                "newPassword": format!("虚构新密码🔒 {aid}-{entry}"),
                "changedAt": "2026-11-18T00:00:00.000Z", "reason": "隔离压力测试"
            })).collect::<Vec<_>>();
                        json!({
                            "id": account + 1, "uuid": uuid(2, aid),
                            "title": "测试账号", "username": format!("test-user-{account}"),
                            "password": format!("虚构密码🔐 {aid}"), "tag": "压力测试",
                            "notes": "仅虚构数据\n多行备注", "updatedAt": "2026-11-18",
                            "passwordChangedAt": "2026-11-18", "history": history
                        })
                    })
                    .collect::<Vec<_>>();
            json!({
                "id": index + 1, "uuid": uuid(1, index + 1),
                "title": "隔离设备", "deviceName": format!("压力设备-{index:05}"),
                "deviceType": "测试类型", "deviceTypeUuid": uuid(4, 1),
                "assetCode": format!("TEST-{index}"), "location": "隔离临时目录",
                "username": "", "password": "", "ipAddress": "https://example.invalid/path",
                "tag": "压力测试", "iconText": "测", "iconClass": "blue",
                "updatedAt": "2026-11-18", "notes": "虚构设备，绝不写入真实应用目录",
                "history": [], "accounts": accounts
            })
        })
        .collect::<Vec<_>>();
    json!({
        "revision": 0, "items": items, "snapshots": [],
        "customDeviceTypes": [{"uuid": uuid(4, 1), "label": "测试类型", "iconText": "测", "color": "blue"}]
    })
}
fn milliseconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
fn emit(value: Value) {
    println!("PSD_STRESS {value}");
}

#[test]
#[ignore = "opt-in encrypted filesystem scale pressure test"]
fn stress_encrypted_vault_scales_and_rotation() {
    for count in [100, 1_000, 5_000, 10_000] {
        let scratch = Scratch::new();
        let primary = scratch.0.join(VAULT_FILE_NAME);
        let backup = scratch.0.join(VAULT_BACKUP_FILE_NAME);
        let key = [19; 32];
        let mut data = fixture(count);
        let plaintext_bytes = data.to_string().len();
        let mut previous = None;
        for iteration in 0..3 {
            data["items"][count / 2]["notes"] = json!(format!("连续保存 {iteration} 中文🔐"));
            let content = data.to_string();
            let started = Instant::now();
            let validated = validate_vault_payload(&content).unwrap();
            let validate_ms = milliseconds(started);
            let started = Instant::now();
            let saved = save_payload(&primary, &backup, &key, validated, iteration).unwrap();
            let save_ms = milliseconds(started);
            let started = Instant::now();
            let loaded = load_valid_vault_file(&primary, &key).unwrap();
            let load_ms = milliseconds(started);
            data["revision"] = json!(iteration + 1);
            assert_eq!(serde_json::from_str::<Value>(&saved).unwrap(), data);
            assert_eq!(serde_json::from_str::<Value>(&loaded).unwrap(), data);
            if let Some(previous) = previous {
                assert_eq!(decrypt_vault_file(&backup, &key).unwrap(), previous);
            } else {
                assert!(!backup.exists());
            }
            previous = Some(saved);
            assert!(!primary.with_file_name("vault.enc.tmp").exists());
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                assert_eq!(
                    fs::metadata(&primary).unwrap().permissions().mode() & 0o777,
                    0o600
                );
            }
            emit(json!({
                "case": "encrypted_vault_scale", "profile": if cfg!(debug_assertions) {"debug"} else {"release"},
                "devices": count, "accounts": count * 2, "history": count * 6,
                "iteration": iteration, "plaintext_bytes": plaintext_bytes,
                "encrypted_bytes": fs::metadata(&primary).unwrap().len(),
                "validate_ms": validate_ms, "save_ms": save_ms, "load_ms": load_ms,
                "full_content_equal": true, "previous_backup_equal": true
            }));
        }
        assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 2);
    }
}

#[test]
#[ignore = "opt-in repeated writes, stale revisions, and recovery pressure test"]
fn stress_repeated_saves_stale_revision_and_corruption() {
    let scratch = Scratch::new();
    let primary = scratch.0.join(VAULT_FILE_NAME);
    let backup = scratch.0.join(VAULT_BACKUP_FILE_NAME);
    let key = [23; 32];
    let mut data = fixture(1_000);
    let mut previous = String::new();
    let started = Instant::now();
    for revision in 0..32 {
        data["items"][revision as usize]["accounts"][0]["password"] =
            json!(format!("修改后虚构密码🔐 {revision}"));
        let validated = validate_vault_payload(&data.to_string()).unwrap();
        let saved = save_payload(&primary, &backup, &key, validated, revision).unwrap();
        data["revision"] = json!(revision + 1);
        assert_eq!(
            serde_json::from_str::<Value>(&load_valid_vault_file(&primary, &key).unwrap()).unwrap(),
            data
        );
        if revision > 0 {
            assert_eq!(decrypt_vault_file(&backup, &key).unwrap(), previous);
        }
        previous = saved;
    }
    let repeated_ms = milliseconds(started);
    let committed_primary = fs::read(&primary).unwrap();
    let committed_backup = fs::read(&backup).unwrap();
    for stale in 0..32 {
        assert!(save_payload(&primary, &backup, &key, data.clone(), stale)
            .unwrap_err()
            .contains("版本冲突"));
    }
    assert_eq!(fs::read(&primary).unwrap(), committed_primary);
    assert_eq!(fs::read(&backup).unwrap(), committed_backup);
    fs::write(&primary, b"intentionally corrupt isolated fixture").unwrap();
    let (loaded, source) = load_existing_vault(&primary, &backup, &key).unwrap();
    assert!(source == Some(VaultSource::Backup));
    let recovery = loaded.unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&recovery).unwrap()["revision"],
        31
    );
    let recovery_payload = validate_vault_payload(&recovery).unwrap();
    assert!(save_payload(&primary, &backup, &key, recovery_payload, 31)
        .unwrap_err()
        .starts_with(BACKUP_RECOVERY_REQUIRED));
    assert_eq!(
        fs::read(&primary).unwrap(),
        b"intentionally corrupt isolated fixture"
    );
    assert_eq!(fs::read(&backup).unwrap(), committed_backup);
    assert!(load_existing_vault(&primary, &backup, &[24; 32]).is_err());
    emit(
        json!({"case": "repeated_saves_and_recovery", "devices": 1000, "writes": 32,
        "total_write_and_verify_ms": repeated_ms, "stale_writes_rejected": 32,
        "backup_rotation_equal": true, "corrupt_primary_auto_write_rejected": true, "wrong_key_rejected": true}),
    );
}

#[test]
#[ignore = "opt-in ten snapshots and independent encrypted-backup pressure test"]
fn stress_snapshot_and_independent_backup_roundtrip() {
    let scratch = Scratch::new();
    let primary = scratch.0.join(VAULT_FILE_NAME);
    let backup = scratch.0.join(VAULT_BACKUP_FILE_NAME);
    let key = [29; 32];
    let mut data = fixture(1_000);
    data["snapshots"] = Value::Array((0..10).map(|index| json!({
        "id": format!("stress-snapshot-{index}"), "createdAt": "2026-11-18", "reason": "隔离压力快照",
        "items": data["items"].clone(), "customDeviceTypes": data["customDeviceTypes"].clone()
    })).collect());
    let content = data.to_string();
    let started = Instant::now();
    let validated = validate_vault_payload(&content).unwrap();
    let saved = save_payload(&primary, &backup, &key, validated, 0).unwrap();
    let save_ms = milliseconds(started);
    assert_eq!(load_valid_vault_file(&primary, &key).unwrap(), saved);
    let started = Instant::now();
    let encrypted_backup = create_backup(&saved, None, "isolated-stress-password-2026").unwrap();
    let export_ms = milliseconds(started);
    let backup_file = scratch.0.join("synthetic.psdbackup");
    fs::write(&backup_file, &encrypted_backup).unwrap();
    let reread = fs::read_to_string(&backup_file).unwrap();
    let started = Instant::now();
    let restored = open_backup(&reread, "isolated-stress-password-2026").unwrap();
    let import_ms = milliseconds(started);
    assert!(restored.settings.is_none());
    assert_eq!(
        serde_json::from_str::<Value>(&restored.vault).unwrap(),
        serde_json::from_str::<Value>(&saved).unwrap()
    );
    assert!(open_backup(&reread, "incorrect-stress-password").is_err());
    emit(
        json!({"case": "ten_snapshots_and_encrypted_backup", "devices": 1000,
        "snapshots": 10, "effective_device_records": 11000, "plaintext_bytes": saved.len(),
        "save_including_validation_ms": save_ms, "backup_bytes": encrypted_backup.len(),
        "backup_export_ms": export_ms, "backup_import_ms": import_ms,
        "full_content_equal": true, "wrong_password_rejected": true}),
    );
}
