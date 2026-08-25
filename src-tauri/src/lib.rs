use aes_gcm::{
    aead::{Aead, Generate, Key, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

#[cfg(target_os = "windows")]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

const VAULT_FILE_NAME: &str = "vault.enc";
const VAULT_BACKUP_FILE_NAME: &str = "vault.enc.bak";
const VAULT_LOCK_FILE_NAME: &str = "vault.lock";
const VAULT_KEY_FILE_NAME: &str = "vault.key";
const VAULT_PASSWORD_FILE_NAME: &str = "vault.lock.json";
const APP_SETTINGS_FILE_NAME: &str = "settings.json";
const DATA_CONTAINER_NAME: &str = "Psd Manager";
const DATA_DIRECTORY_NAME: &str = "data";
const VAULT_AAD: &[u8] = b"com.fan.psd-manager:vault:1";
const VAULT_PASSWORD_AAD: &[u8] = b"com.fan.psd-manager:vault-password:1";
const VAULT_RECOVERY_AAD: &[u8] = b"com.fan.psd-manager:vault-recovery:1";
const VAULT_SCHEMA_VERSION: u64 = 2;
const BACKUP_RECOVERY_REQUIRED: &str = "BACKUP_RECOVERY_REQUIRED";
static VAULT_IO_LOCK: Mutex<()> = Mutex::new(());
static APP_SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());
const PASSWORD_LOCK_VERSION: u8 = 1;
const PASSWORD_SALT_LENGTH: usize = 16;
const PASSWORD_NONCE_LENGTH: usize = 12;
const PASSWORD_KEY_LENGTH: usize = 32;
const PASSWORD_TAG_LENGTH: usize = 16;
const RECOVERY_KEY_PREFIX: &str = "PSDM-";
const RECOVERY_FILE_FORMAT: &str = "psd-manager-recovery";
const RECOVERY_FILE_VERSION: u8 = 1;
const PASSWORD_MIN_LENGTH: usize = 8;
const PASSWORD_MAX_LENGTH: usize = 256;
const PASSWORD_KDF_MEMORY_KIB: u32 = 64 * 1024;
const PASSWORD_KDF_ITERATIONS: u32 = 3;
const PASSWORD_KDF_PARALLELISM: u32 = 1;

#[derive(Serialize, Deserialize)]
struct EncryptedVaultFile {
    version: u8,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PasswordKdfParameters {
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PasswordLockFile {
    version: u8,
    kdf: PasswordKdfParameters,
    salt: Vec<u8>,
    nonce: Vec<u8>,
    wrapped_key: Vec<u8>,
    #[serde(default)]
    recovery_nonce: Vec<u8>,
    #[serde(default)]
    recovery_wrapped_key: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryFilePayload {
    format: String,
    version: u8,
    recovery_key: String,
}

struct VaultSession(Mutex<Option<Vec<u8>>>);

#[derive(Clone, Copy, PartialEq, Eq)]
enum VaultSource {
    Primary,
    Backup,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    installation_path: String,
    data_path: String,
}

fn installation_directory() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("无法获取应用程序路径：{error}"))?;
    let executable_directory = executable
        .parent()
        .ok_or_else(|| "应用程序路径缺少父目录".to_string())?;

    #[cfg(target_os = "macos")]
    {
        if let Some(bundle_directory) = executable_directory
            .ancestors()
            .find(|path| path.extension().is_some_and(|extension| extension == "app"))
        {
            return Ok(bundle_directory.to_path_buf());
        }
    }

    Ok(executable_directory.to_path_buf())
}

fn storage_info(app: &AppHandle) -> Result<StorageInfo, String> {
    let data_directory = data_directory(app)?;
    Ok(StorageInfo {
        installation_path: installation_directory()?.to_string_lossy().into_owned(),
        data_path: data_directory.to_string_lossy().into_owned(),
    })
}

fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer.exe").arg(path).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(path).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let result: Result<std::process::Child, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "当前平台不支持打开目录",
    ));

    result
        .map(|_| ())
        .map_err(|error| format!("无法打开目录 {}：{error}", path.display()))
}

fn vault_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let directory = ensure_vault_directory(app)?;
    Ok((
        directory.join(VAULT_FILE_NAME),
        directory.join(VAULT_BACKUP_FILE_NAME),
    ))
}

fn data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    let parent = app_data_directory
        .parent()
        .ok_or_else(|| "应用数据目录缺少父目录".to_string())?;
    Ok(parent.join(DATA_CONTAINER_NAME).join(DATA_DIRECTORY_NAME))
}

fn ensure_vault_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = data_directory(app)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建资产库目录：{error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("无法限制资产库目录权限：{error}"))?;
    }
    Ok(directory)
}

fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(APP_SETTINGS_FILE_NAME))
}

fn validate_app_settings_content(content: &str) -> Result<serde_json::Value, String> {
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|error| format!("应用设置不是合法 JSON：{error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "应用设置必须是对象".to_string())?;
    let schema_version = object
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "应用设置缺少 schemaVersion".to_string())?;
    if schema_version != 2 {
        return Err("不支持的应用设置版本，当前仅支持 2".to_string());
    }
    Ok(value)
}

fn load_app_settings_sync(app: &AppHandle) -> Result<Option<String>, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    restrict_private_file(&path, "应用设置")?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("无法读取应用设置：{error}"))?;
    validate_app_settings_content(&content)?;
    Ok(Some(content))
}

fn save_app_settings_sync(app: &AppHandle, content: String) -> Result<String, String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    validate_app_settings_content(&content)?;
    let normalized = serde_json::to_string(&validate_app_settings_content(&content)?)
        .map_err(|error| format!("无法编码应用设置：{error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时应用设置：{error}"))?;
    restrict_private_file(&temporary_path, "临时应用设置")?;
    file.write_all(normalized.as_bytes())
        .map_err(|error| format!("无法写入应用设置：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步应用设置：{error}"))?;
    drop(file);
    if let Err(rename_error) = fs::rename(&temporary_path, &path) {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| {
                format!("无法替换应用设置：{rename_error}；无法移除旧设置：{error}")
            })?;
            fs::rename(&temporary_path, &path)
                .map_err(|error| format!("无法替换应用设置：{error}"))?;
        } else {
            return Err(format!("无法替换应用设置：{rename_error}"));
        }
    }
    restrict_private_file(&path, "应用设置")?;
    sync_parent_directory(&path)?;
    Ok(normalized)
}

fn reset_app_settings_sync(app: &AppHandle) -> Result<(), String> {
    let _guard = APP_SETTINGS_IO_LOCK
        .lock()
        .map_err(|_| "应用设置文件锁已损坏".to_string())?;
    let path = app_settings_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法删除应用设置：{error}"))?;
        sync_parent_directory(&path)?;
    }
    Ok(())
}

fn lock_vault_file(app: &AppHandle) -> Result<File, String> {
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

fn vault_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(VAULT_KEY_FILE_NAME))
}

fn password_lock_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_vault_directory(app)?.join(VAULT_PASSWORD_FILE_NAME))
}

fn password_lock_parameters() -> PasswordKdfParameters {
    PasswordKdfParameters {
        memory_kib: PASSWORD_KDF_MEMORY_KIB,
        iterations: PASSWORD_KDF_ITERATIONS,
        parallelism: PASSWORD_KDF_PARALLELISM,
    }
}

fn validate_master_password(password: &str) -> Result<(), String> {
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

fn derive_password_key(
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

fn validate_password_kdf_parameters(
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

fn read_password_lock_file(app: &AppHandle) -> Result<Option<PasswordLockFile>, String> {
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

fn write_private_bytes(path: &Path, bytes: &[u8], label: &str) -> Result<(), String> {
    let temporary_path = path.with_extension("tmp");
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary_path)
        .map_err(|error| format!("无法创建临时{label}：{error}"))?;
    restrict_private_file(&temporary_path, &format!("临时{label}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("无法写入{label}：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步{label}：{error}"))?;
    drop(file);
    if let Err(rename_error) = fs::rename(&temporary_path, path) {
        if path.exists() {
            fs::remove_file(path).map_err(|error| {
                format!("无法替换{label}：{rename_error}；无法移除旧文件：{error}")
            })?;
            fs::rename(&temporary_path, path)
                .map_err(|error| format!("无法替换{label}：{error}"))?;
        } else {
            return Err(format!("无法替换{label}：{rename_error}"));
        }
    }
    restrict_private_file(path, label)?;
    sync_parent_directory(path)?;
    Ok(())
}

fn wrap_vault_key(vault_key: &[u8], password: &str) -> Result<(PasswordLockFile, Vec<u8>), String> {
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

fn unwrap_vault_key(lock_file: &PasswordLockFile, password: &str) -> Result<Vec<u8>, String> {
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

fn unwrap_vault_key_with_recovery(
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

fn parse_recovery_file(content: &str) -> Result<Vec<u8>, String> {
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

fn format_recovery_file(secret: &[u8]) -> Result<String, String> {
    let payload = RecoveryFilePayload {
        format: RECOVERY_FILE_FORMAT.to_string(),
        version: RECOVERY_FILE_VERSION,
        recovery_key: format_recovery_key(secret)?,
    };
    serde_json::to_string_pretty(&payload)
        .map(|content| format!("{content}\n"))
        .map_err(|error| format!("无法生成恢复文件：{error}"))
}

fn write_password_lock_file(app: &AppHandle, lock_file: &PasswordLockFile) -> Result<(), String> {
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

fn sync_parent_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        let directory = path
            .parent()
            .ok_or_else(|| "资产库路径缺少父目录".to_string())?;
        let directory_file = File::open(directory)
            .map_err(|error| format!("无法打开资产库目录进行同步：{error}"))?;
        directory_file
            .sync_all()
            .map_err(|error| format!("无法同步资产库目录：{error}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn restrict_private_file(path: &Path, description: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("无法限制{description}文件权限：{error}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = (path, description);
    }
    Ok(())
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

fn read_local_vault_key(app: &AppHandle) -> Result<Option<Vec<u8>>, String> {
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

fn write_local_vault_key(app: &AppHandle, key: &[u8]) -> Result<(), String> {
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
    sync_parent_directory(&key_path)?;
    Ok(())
}

fn get_or_create_local_vault_key(app: &AppHandle, vault_exists: bool) -> Result<Vec<u8>, String> {
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

fn validate_vault_payload(content: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(content).map_err(|error| format!("资产库内容格式不正确：{error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "资产库内容必须是对象".to_string())?;
    let version = object
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "资产库内容缺少 schemaVersion".to_string())?;
    if version != VAULT_SCHEMA_VERSION {
        return Err(format!(
            "不支持资产库数据版本 {version}，当前仅支持 {VAULT_SCHEMA_VERSION}"
        ));
    }
    for key in ["items", "customDeviceTypes"] {
        if !object.get(key).is_some_and(Value::is_array) {
            return Err(format!("资产库字段 {key} 必须是数组"));
        }
    }
    if !object.get("snapshots").is_some_and(Value::is_array) {
        return Err("资产库字段 snapshots 必须是数组".to_string());
    }
    if object.get("revision").and_then(Value::as_u64).is_none() {
        return Err("资产库字段 revision 必须是非负整数".to_string());
    }
    Ok(value)
}

#[cfg(desktop)]
fn restore_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn vault_revision(value: &Value) -> u64 {
    value.get("revision").and_then(Value::as_u64).unwrap_or(0)
}

fn load_existing_vault(
    vault_path: &Path,
    backup_path: &Path,
    key: &[u8],
) -> Result<(Option<String>, Option<VaultSource>), String> {
    if vault_path.exists() {
        match decrypt_vault_file(vault_path, key) {
            Ok(content) => return Ok((Some(content), Some(VaultSource::Primary))),
            Err(primary_error) if backup_path.exists() => {
                return decrypt_vault_file(backup_path, key)
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
        return decrypt_vault_file(backup_path, key)
            .map(|content| (Some(content), Some(VaultSource::Backup)));
    }
    Ok((None, None))
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

fn decrypt_vault_file(path: &Path, key: &[u8]) -> Result<String, String> {
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

fn load_secure_vault_sync(app: &AppHandle) -> Result<Option<String>, String> {
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

fn save_secure_vault_sync(
    app: &AppHandle,
    content: String,
    expected_revision: u64,
) -> Result<String, String> {
    let _guard = VAULT_IO_LOCK
        .lock()
        .map_err(|_| "资产库文件锁已损坏".to_string())?;
    let _file_guard = lock_vault_file(app)?;
    let mut payload = validate_vault_payload(&content)?;
    if vault_revision(&payload) != expected_revision {
        return Err("前端资产库版本与预期版本不一致".to_string());
    }
    let (vault_path, backup_path) = vault_paths(app)?;
    restrict_existing_vault_files(&vault_path, &backup_path)?;
    let session = app.state::<VaultSession>();
    let key = if vault_path.exists() || backup_path.exists() {
        active_vault_key(app, &session)?
    } else if read_password_lock_file(app)?.is_some() {
        active_vault_key(app, &session)?
    } else {
        get_or_create_local_vault_key(app, false)?
    };
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
        restore_backup_as_primary(&vault_path, &backup_path)?;
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

    if vault_path.exists() {
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("无法清理旧资产库快照：{error}"))?;
            sync_parent_directory(&backup_path)?;
        }
        fs::rename(&vault_path, &backup_path)
            .map_err(|error| format!("无法创建资产库安全快照：{error}"))?;
        sync_parent_directory(&backup_path)?;
    }
    if let Err(error) = fs::rename(&temporary_path, &vault_path) {
        if backup_path.exists() && !vault_path.exists() {
            let _ = fs::rename(&backup_path, &vault_path);
            let _ = sync_parent_directory(&vault_path);
        }
        return Err(format!("无法替换加密资产库：{error}"));
    }
    sync_parent_directory(&vault_path)?;

    let persisted = decrypt_vault_file(&vault_path, &key)?;
    if persisted != content {
        return Err("加密资产库落盘校验不一致".to_string());
    }
    // Keep the previous successfully written version as a recovery point. The
    // next save rotates it before replacing the primary file.
    Ok(content)
}

fn recover_vault_backup_sync(app: &AppHandle) -> Result<(), String> {
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
    if vault_path.exists() && decrypt_vault_file(&vault_path, &key).is_ok() {
        return Err("主资产库已经恢复可读，请重新读取，未使用旧备份覆盖".to_string());
    }
    let content = decrypt_vault_file(&backup_path, &key)?;
    validate_vault_payload(&content)?;
    restore_backup_as_primary(&vault_path, &backup_path)
}

#[tauri::command]
async fn load_secure_vault(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || load_secure_vault_sync(&app))
        .await
        .map_err(|error| format!("资产库读取任务失败：{error}"))?
}

#[tauri::command]
async fn save_secure_vault(
    app: AppHandle,
    content: String,
    expected_revision: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_secure_vault_sync(&app, content, expected_revision)
    })
    .await
    .map_err(|error| format!("资产库保存任务失败：{error}"))?
}

#[tauri::command]
async fn get_vault_lock_status(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(read_password_lock_file(&app)?.is_some()))
        .await
        .map_err(|error| format!("启动密码状态读取任务失败：{error}"))?
}

#[tauri::command]
async fn setup_vault_password(app: AppHandle, password: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        if read_password_lock_file(&app)?.is_some() {
            return Err("启动密码已经设置".to_string());
        }
        let (vault_path, backup_path) = vault_paths(&app)?;
        let vault_exists = vault_path.exists() || backup_path.exists();
        let key = get_or_create_local_vault_key(&app, vault_exists)?;
        let (lock_file, recovery_secret) = wrap_vault_key(&key, &password)?;
        write_password_lock_file(&app, &lock_file)?;
        let verified = unwrap_vault_key(&lock_file, &password)?;
        if verified != key {
            let _ = fs::remove_file(password_lock_path(&app)?);
            return Err("启动密码配置校验失败".to_string());
        }
        let key_path = vault_key_path(&app)?;
        if key_path.exists() {
            if let Err(error) = fs::remove_file(&key_path) {
                let _ = fs::remove_file(password_lock_path(&app)?);
                return Err(format!("无法移除本地资产库密钥，启动密码未启用：{error}"));
            }
            sync_parent_directory(&key_path)?;
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        format_recovery_file(&recovery_secret)
    })
    .await
    .map_err(|error| format!("设置启动密码任务失败：{error}"))?
}

#[tauri::command]
async fn unlock_vault(app: AppHandle, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let key = unwrap_vault_key(&lock_file, &password)?;
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(())
    })
    .await
    .map_err(|error| format!("解锁资产库任务失败：{error}"))?
}

#[tauri::command]
async fn recover_vault_password(
    app: AppHandle,
    recovery_file: String,
    new_password: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let recovery_secret = parse_recovery_file(&recovery_file)?;
        let key = unwrap_vault_key_with_recovery(&lock_file, &recovery_secret)?;
        let (new_lock_file, new_recovery_secret) = wrap_vault_key(&key, &new_password)?;
        write_password_lock_file(&app, &new_lock_file)?;
        let verified_key = unwrap_vault_key(&new_lock_file, &new_password)?;
        if verified_key != key {
            return Err("新启动密码配置校验失败".to_string());
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        format_recovery_file(&new_recovery_secret)
    })
    .await
    .map_err(|error| format!("恢复启动密码任务失败：{error}"))?
}

#[tauri::command]
fn lock_vault(state: tauri::State<'_, VaultSession>) -> Result<(), String> {
    *state
        .0
        .lock()
        .map_err(|_| "资产库解锁状态已损坏".to_string())? = None;
    Ok(())
}

#[tauri::command]
async fn change_vault_password(
    app: AppHandle,
    current_password: String,
    new_password: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let old_lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let key = unwrap_vault_key(&old_lock_file, &current_password)?;
        let (new_lock_file, recovery_secret) = wrap_vault_key(&key, &new_password)?;
        write_password_lock_file(&app, &new_lock_file)?;
        let verified = unwrap_vault_key(&new_lock_file, &new_password)?;
        if verified != key {
            return Err("新启动密码配置校验失败".to_string());
        }
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        format_recovery_file(&recovery_secret)
    })
    .await
    .map_err(|error| format!("修改启动密码任务失败：{error}"))?
}

#[tauri::command]
async fn disable_vault_password(app: AppHandle, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = VAULT_IO_LOCK
            .lock()
            .map_err(|_| "资产库文件锁已损坏".to_string())?;
        let _file_guard = lock_vault_file(&app)?;
        let lock_file =
            read_password_lock_file(&app)?.ok_or_else(|| "启动密码尚未设置".to_string())?;
        let key = unwrap_vault_key(&lock_file, &password)?;
        let key_path = vault_key_path(&app)?;
        let key_created = !key_path.exists();
        if key_created {
            write_local_vault_key(&app, &key)?;
        } else if read_local_vault_key(&app)?.as_deref() != Some(key.as_slice()) {
            return Err("本地资产库密钥与启动密码配置不一致，拒绝关闭启动密码".to_string());
        }
        let lock_path = password_lock_path(&app)?;
        if let Err(error) = fs::remove_file(&lock_path) {
            if key_created {
                let _ = fs::remove_file(&key_path);
            }
            return Err(format!("无法关闭启动密码：{error}"));
        }
        sync_parent_directory(&lock_path)?;
        let session = app.state::<VaultSession>();
        *session
            .0
            .lock()
            .map_err(|_| "资产库解锁状态已损坏".to_string())? = Some(key);
        Ok(())
    })
    .await
    .map_err(|error| format!("关闭启动密码任务失败：{error}"))?
}

#[tauri::command]
async fn recover_vault_backup(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || recover_vault_backup_sync(&app))
        .await
        .map_err(|error| format!("资产库安全备份恢复任务失败：{error}"))?
}

#[tauri::command]
async fn load_app_settings(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || load_app_settings_sync(&app))
        .await
        .map_err(|error| format!("应用设置读取任务失败：{error}"))?
}

#[tauri::command]
async fn save_app_settings(app: AppHandle, content: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || save_app_settings_sync(&app, content))
        .await
        .map_err(|error| format!("应用设置保存任务失败：{error}"))?
}

#[tauri::command]
async fn reset_app_settings(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reset_app_settings_sync(&app))
        .await
        .map_err(|error| format!("应用设置重置任务失败：{error}"))?
}

#[tauri::command]
fn get_storage_info(app: AppHandle) -> Result<StorageInfo, String> {
    storage_info(&app)
}

#[tauri::command]
fn open_storage_path(app: AppHandle, kind: String) -> Result<(), String> {
    let path = match kind.as_str() {
        "installation" => installation_directory()?,
        "data" => ensure_vault_directory(&app)?,
        _ => return Err("不支持的目录类型".to_string()),
    };
    open_directory(&path)
}

#[tauri::command]
fn exit_application(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    builder = builder.manage(VaultSession(Mutex::new(None)));
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            #[cfg(target_os = "macos")]
            let _ = app.show();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
        builder = builder.plugin(tauri_plugin_autostart::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::PhysicalSize;

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window
                    .current_monitor()
                    .or_else(|_| window.primary_monitor())
                {
                    let screen_size = monitor.size();
                    let width = ((screen_size.width as f64) * 0.75).round() as u32;
                    let height = ((screen_size.height as f64) * 0.75).round() as u32;

                    let _ = window.set_size(PhysicalSize::new(width.max(1024), height.max(720)));
                    let _ = window.center();
                }
            }

            #[cfg(desktop)]
            {
                let show_item =
                    MenuItem::with_id(app, "show", "打开密码管理器", true, None::<&str>)?;
                let lock_item = MenuItem::with_id(app, "lock", "立即锁定", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let exit_item = MenuItem::with_id(app, "exit", "关闭程序", true, None::<&str>)?;
                let menu =
                    Menu::with_items(app, &[&show_item, &lock_item, &separator, &exit_item])?;
                let mut tray = TrayIconBuilder::with_id("main")
                    .menu(&menu)
                    .tooltip("密码管理器")
                    .on_menu_event(|app, event| {
                        if event.id() == "show" {
                            restore_main_window(app);
                        } else if event.id() == "lock" {
                            let _ = app.emit("tray-lock-requested", ());
                        } else if event.id() == "exit" {
                            let _ = app.emit("tray-exit-requested", ());
                        }
                    });
                #[cfg(target_os = "windows")]
                {
                    tray = tray
                        .show_menu_on_left_click(false)
                        .on_tray_icon_event(|tray, event| match event {
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            }
                            | TrayIconEvent::DoubleClick {
                                button: MouseButton::Left,
                                ..
                            } => {
                                restore_main_window(&tray.app_handle());
                            }
                            _ => {}
                        });
                }
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                {
                    tray = tray.show_menu_on_left_click(true);
                }
                if let Some(icon) = app.default_window_icon().cloned() {
                    tray = tray.icon(icon);
                }
                tray.build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_secure_vault,
            save_secure_vault,
            get_vault_lock_status,
            setup_vault_password,
            unlock_vault,
            recover_vault_password,
            lock_vault,
            change_vault_password,
            disable_vault_password,
            recover_vault_backup,
            exit_application,
            load_app_settings,
            save_app_settings,
            reset_app_settings,
            get_storage_info,
            open_storage_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
