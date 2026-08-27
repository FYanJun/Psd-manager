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
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    WebviewWindowBuilder,
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
const CONFIG_DIRECTORY_NAME: &str = "config";
const VAULT_AAD: &[u8] = b"com.fan.psd-manager:vault:1";
const VAULT_PASSWORD_AAD: &[u8] = b"com.fan.psd-manager:vault-password:1";
const VAULT_RECOVERY_AAD: &[u8] = b"com.fan.psd-manager:vault-recovery:1";
const VAULT_SCHEMA_VERSION: u64 = 2;
const BACKUP_RECOVERY_REQUIRED: &str = "BACKUP_RECOVERY_REQUIRED";
const AUTOSTART_LAUNCH_ARGUMENT: &str = "--from-autostart";
static VAULT_IO_LOCK: Mutex<()> = Mutex::new(());
static APP_SETTINGS_IO_LOCK: Mutex<()> = Mutex::new(());
#[cfg(desktop)]
static MAIN_WINDOW_CREATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default)]
struct ExitIntent(AtomicBool);
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
#[serde(deny_unknown_fields)]
struct EncryptedVaultFile {
    version: u8,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct PasswordKdfParameters {
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
    app_data_path: String,
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
    let app_data_directory = data_container_directory(app)?;
    Ok(StorageInfo {
        installation_path: installation_directory()?.to_string_lossy().into_owned(),
        app_data_path: app_data_directory.to_string_lossy().into_owned(),
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

fn data_container_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    let parent = app_data_directory
        .parent()
        .ok_or_else(|| "应用数据目录缺少父目录".to_string())?;
    Ok(parent.join(DATA_CONTAINER_NAME))
}

fn migrate_legacy_settings(data_directory: &Path, config_directory: &Path) -> Result<(), String> {
    let mut legacy_files = vec!["settings.json".to_string(), "settings.json.tmp".to_string()];
    let entries =
        fs::read_dir(data_directory).map_err(|error| format!("无法检查旧应用设置文件：{error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取旧应用设置文件：{error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(".settings.json.replace-backup-") && entry.path().is_file() {
            legacy_files.push(name);
        }
    }

    let mut pending_moves: Vec<(PathBuf, PathBuf)> = Vec::new();
    for file_name in legacy_files {
        let source = data_directory.join(&file_name);
        if !source.exists() {
            continue;
        }
        let target = config_directory.join(&file_name);
        if target.exists() {
            return Err(format!(
                "发现旧设置文件与新设置文件同时存在：{} 和 {}，已停止迁移以避免覆盖",
                source.display(),
                target.display()
            ));
        }
        restrict_private_file(&source, "旧应用设置")?;
        pending_moves.push((source, target));
    }

    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (source, target) in pending_moves {
        if let Err(error) = fs::rename(&source, &target) {
            let rollback_errors = moved
                .iter()
                .rev()
                .filter_map(|(old_path, new_path)| {
                    fs::rename(new_path, old_path)
                        .err()
                        .map(|rollback_error| format!("{}：{rollback_error}", old_path.display()))
                })
                .collect::<Vec<_>>();
            return if rollback_errors.is_empty() {
                Err(format!("无法迁移旧设置文件 {}：{error}", source.display()))
            } else {
                Err(format!(
                    "无法迁移旧设置文件 {}：{error}；回滚失败：{}",
                    source.display(),
                    rollback_errors.join("；")
                ))
            };
        }
        moved.push((source, target));
    }

    for (_, target) in moved {
        restrict_private_file(&target, "应用设置")?;
    }
    Ok(())
}

fn ensure_storage_directories(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let container = data_container_directory(app)?;
    fs::create_dir_all(&container).map_err(|error| format!("无法创建应用数据根目录：{error}"))?;
    restrict_private_directory(&container, "应用数据根目录")?;

    let data = container.join(DATA_DIRECTORY_NAME);
    let config = container.join(CONFIG_DIRECTORY_NAME);
    fs::create_dir_all(&data).map_err(|error| format!("无法创建资产库目录：{error}"))?;
    fs::create_dir_all(&config).map_err(|error| format!("无法创建应用配置目录：{error}"))?;
    restrict_private_directory(&data, "资产库目录")?;
    restrict_private_directory(&config, "应用配置目录")?;
    migrate_legacy_settings(&data, &config)?;
    Ok((data, config))
}

fn ensure_vault_directory(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_storage_directories(app).map(|(data, _)| data)
}

fn ensure_config_directory(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_storage_directories(app).map(|(_, config)| config)
}

fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_config_directory(app)?.join(APP_SETTINGS_FILE_NAME))
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppSettingsFile {
    schema_version: u64,
    interface: AppInterfaceSettings,
    workspace: AppWorkspaceSettings,
    password_generator: AppGeneratorSettings,
}

fn default_low_memory_background() -> bool {
    true
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppInterfaceSettings {
    tooltip_enabled: bool,
    theme: String,
    density: String,
    font_size: String,
    start_on_boot: bool,
    startup_lock: bool,
    auto_lock_minutes: u64,
    #[serde(default = "default_low_memory_background")]
    low_memory_background: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppWorkspaceSettings {
    remember_layout: bool,
    pane_layout: AppPaneLayout,
    device_sort_mode: String,
    device_type_sort_mode: String,
    remember_last_view: bool,
    remember_window_bounds: bool,
    window_bounds: Option<AppWindowBounds>,
    last_view: AppLastView,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppPaneLayout {
    sidebar_ratio: f64,
    list_ratio: f64,
    generator_ratio: f64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppWindowBounds {
    x: i64,
    y: i64,
    width: u64,
    height: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppLastView {
    device_type: String,
    search_query: String,
    sort_mode: String,
    selected_device_uuid: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppGeneratorSettings {
    length: u64,
    use_upper: bool,
    use_lower: bool,
    use_numbers: bool,
    use_symbols: bool,
    exclude_similar: bool,
    prevent_repeats: bool,
    minimum_numbers: u64,
    minimum_symbols: u64,
    allowed_symbols: String,
    excluded_characters: String,
}

fn is_valid_uuid(value: &str) -> bool {
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

fn validate_setting_enum(value: &str, field: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("应用设置字段 {field} 的值不受支持"))
    }
}

fn validate_app_settings_content(content: &str) -> Result<serde_json::Value, String> {
    let settings: AppSettingsFile =
        serde_json::from_str(content).map_err(|error| format!("应用设置格式不正确：{error}"))?;
    if settings.schema_version != 2 {
        return Err("不支持的应用设置版本，当前仅支持 2".to_string());
    }
    validate_setting_enum(
        &settings.interface.theme,
        "interface.theme",
        &["system", "light", "dark"],
    )?;
    validate_setting_enum(
        &settings.interface.density,
        "interface.density",
        &["standard", "compact"],
    )?;
    validate_setting_enum(
        &settings.interface.font_size,
        "interface.fontSize",
        &["small", "standard", "large"],
    )?;
    if settings.interface.auto_lock_minutes > 10_080 {
        return Err("应用设置字段 interface.autoLockMinutes 超出范围".to_string());
    }
    validate_setting_enum(
        &settings.workspace.device_sort_mode,
        "workspace.deviceSortMode",
        &["updatedDesc", "nameAsc", "typeAsc"],
    )?;
    validate_setting_enum(
        &settings.workspace.device_type_sort_mode,
        "workspace.deviceTypeSortMode",
        &["default", "nameAsc", "countDesc"],
    )?;
    validate_setting_enum(
        &settings.workspace.last_view.sort_mode,
        "workspace.lastView.sortMode",
        &["updatedDesc", "nameAsc", "typeAsc"],
    )?;
    if settings.workspace.last_view.device_type.trim().is_empty()
        || (!settings.workspace.last_view.selected_device_uuid.is_empty()
            && !is_valid_uuid(&settings.workspace.last_view.selected_device_uuid))
    {
        return Err("应用设置中的最近视图数据不正确".to_string());
    }
    let layout = &settings.workspace.pane_layout;
    for (field, value, minimum, maximum) in [
        ("sidebarRatio", layout.sidebar_ratio, 0.12, 0.20),
        ("listRatio", layout.list_ratio, 0.18, 0.34),
        ("generatorRatio", layout.generator_ratio, 0.24, 0.48),
    ] {
        if !value.is_finite() || value < minimum || value > maximum {
            return Err(format!(
                "应用设置字段 workspace.paneLayout.{field} 超出范围"
            ));
        }
    }
    if let Some(bounds) = &settings.workspace.window_bounds {
        if bounds.width < 1024
            || bounds.width > 10_000
            || bounds.height < 720
            || bounds.height > 10_000
        {
            return Err("应用设置中的窗口尺寸超出范围".to_string());
        }
        if bounds.x < -100_000 || bounds.x > 100_000 || bounds.y < -100_000 || bounds.y > 100_000 {
            return Err("应用设置中的窗口位置超出范围".to_string());
        }
    }
    let generator = &settings.password_generator;
    if !(3..=24).contains(&generator.length)
        || generator.minimum_numbers > generator.length
        || generator.minimum_symbols > generator.length
        || generator.minimum_numbers + generator.minimum_symbols > generator.length
        || generator.allowed_symbols.chars().count() > 128
        || generator.excluded_characters.chars().count() > 128
    {
        return Err("应用设置中的密码生成器参数不正确".to_string());
    }
    serde_json::to_value(settings).map_err(|error| format!("无法编码应用设置：{error}"))
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
    replace_file_with_rollback(&temporary_path, &path, "应用设置")?;
    restrict_private_file(&path, "应用设置")?;
    let _ = sync_parent_directory(&path);
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
    replace_file_with_rollback(&temporary_path, path, label)?;
    restrict_private_file(path, label)?;
    // The file itself was synced before replacement. Directory fsync is
    // best-effort so a platform refusal cannot make callers believe a password
    // change failed after the lock file was updated.
    let _ = sync_parent_directory(path);
    Ok(())
}

fn replace_file_with_rollback(
    temporary_path: &Path,
    target_path: &Path,
    label: &str,
) -> Result<(), String> {
    cleanup_replace_backups(target_path, label)?;
    let first_error = match fs::rename(temporary_path, target_path) {
        Ok(()) => return Ok(()),
        Err(error) => error,
    };

    if !target_path.exists() {
        return Err(format!("无法替换{label}：{first_error}"));
    }

    // Windows does not consistently replace an existing file with rename.
    // Move the old file aside first so a failed second rename can restore it.
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("无法替换{label}：目标文件名不正确"))?;
    let rollback_path = target_path.with_file_name(format!(
        ".{file_name}.replace-backup-{}",
        std::process::id()
    ));
    fs::rename(target_path, &rollback_path)
        .map_err(|error| format!("无法替换{label}：无法暂存旧文件：{error}"))?;

    match fs::rename(temporary_path, target_path) {
        Ok(()) => {
            // The target has already been replaced successfully. A stale rollback
            // file is recoverable and must not make callers report a false failure
            // (especially for password-lock changes).
            let _ = fs::remove_file(&rollback_path);
            Ok(())
        }
        Err(rename_error) => {
            let rollback_error = fs::rename(&rollback_path, target_path).err();
            let _ = fs::remove_file(temporary_path);
            match rollback_error {
                Some(error) => Err(format!(
                    "无法替换{label}：{rename_error}；回滚旧文件失败：{error}"
                )),
                None => Err(format!("无法替换{label}：{rename_error}")),
            }
        }
    }
}

fn cleanup_replace_backups(target_path: &Path, label: &str) -> Result<(), String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| format!("无法替换{label}：目标文件路径不正确"))?;
    let file_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("无法替换{label}：目标文件名不正确"))?;
    let prefix = format!(".{file_name}.replace-backup-");
    let entries = fs::read_dir(parent)
        .map_err(|error| format!("无法替换{label}：无法检查旧替换备份：{error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("无法替换{label}：无法读取旧替换备份：{error}"))?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(&prefix) {
            fs::remove_file(entry.path())
                .map_err(|error| format!("无法替换{label}：无法清理旧替换备份：{error}"))?;
        }
    }
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

fn restore_private_file(path: &Path, previous: Option<&[u8]>, label: &str) -> Result<(), String> {
    match previous {
        Some(bytes) => write_private_bytes(path, bytes, label),
        None => {
            if path.exists() {
                fs::remove_file(path).map_err(|error| format!("无法清理{label}：{error}"))?;
                sync_parent_directory(path)?;
            }
            Ok(())
        }
    }
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

fn restrict_private_directory(path: &Path, description: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("无法限制{description}目录权限：{error}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = (path, description);
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
    restrict_private_file(&key_path, "资产库密钥")?;
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

fn validate_vault_payload(content: &str) -> Result<Value, String> {
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

#[cfg(desktop)]
fn restore_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            return;
        }

        let _guard = match MAIN_WINDOW_CREATE_LOCK.lock() {
            Ok(guard) => guard,
            Err(_) => {
                eprintln!("主窗口创建锁已损坏");
                return;
            }
        };

        // Multiple tray clicks can queue restore tasks while the WebView is
        // being created. Check again after acquiring the lock so only one
        // `main` window is ever rebuilt.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            return;
        }

        let Some(config) = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")
            .cloned()
        else {
            eprintln!("未找到 main 窗口配置，无法恢复主窗口");
            return;
        };

        match WebviewWindowBuilder::from_config(&app, &config).and_then(|builder| builder.build()) {
            Ok(window) => {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Err(error) => eprintln!("恢复主窗口失败：{error}"),
        }
    });
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

fn load_valid_vault_file(path: &Path, key: &[u8]) -> Result<String, String> {
    let content = decrypt_vault_file(path, key)?;
    validate_vault_payload(&content)?;
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
    let key =
        if vault_path.exists() || backup_path.exists() || read_password_lock_file(app)?.is_some() {
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
    if vault_path.exists() && load_valid_vault_file(&vault_path, &key).is_ok() {
        return Err("主资产库已经恢复可读，请重新读取，未使用旧备份覆盖".to_string());
    }
    load_valid_vault_file(&backup_path, &key)?;
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
        let lock_path = password_lock_path(&app)?;
        write_password_lock_file(&app, &lock_file)?;
        let verified = unwrap_vault_key(&lock_file, &password)?;
        if verified != key {
            let _ = restore_private_file(&lock_path, None, "启动密码配置");
            return Err("启动密码配置校验失败".to_string());
        }
        let key_path = vault_key_path(&app)?;
        if key_path.exists() {
            if let Err(error) = fs::remove_file(&key_path) {
                let _ = restore_private_file(&lock_path, None, "启动密码配置");
                return Err(format!("无法移除本地资产库密钥，启动密码未启用：{error}"));
            }
            if let Err(error) = sync_parent_directory(&key_path) {
                let key_restore = restore_private_file(&key_path, Some(&key), "资产库密钥");
                let lock_cleanup = restore_private_file(&lock_path, None, "启动密码配置");
                return Err(format!(
                    "无法同步本地资产库密钥，启动密码未启用：{error}{}{}",
                    key_restore
                        .err()
                        .map(|restore_error| format!("；恢复本地资产库密钥失败：{restore_error}"))
                        .unwrap_or_default(),
                    lock_cleanup
                        .err()
                        .map(|cleanup_error| format!("；清理启动密码配置失败：{cleanup_error}"))
                        .unwrap_or_default(),
                ));
            }
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
        let lock_path = password_lock_path(&app)?;
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        let recovery_secret = parse_recovery_file(&recovery_file)?;
        let key = unwrap_vault_key_with_recovery(&lock_file, &recovery_secret)?;
        let (new_lock_file, new_recovery_secret) = wrap_vault_key(&key, &new_password)?;
        write_password_lock_file(&app, &new_lock_file)?;
        let verified_key = match unwrap_vault_key(&new_lock_file, &new_password) {
            Ok(verified_key) if verified_key == key => verified_key,
            _ => {
                let rollback =
                    restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
                return Err(format!(
                    "新启动密码配置校验失败{}",
                    rollback
                        .err()
                        .map(|error| format!("；恢复旧启动密码配置失败：{error}"))
                        .unwrap_or_default(),
                ));
            }
        };
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
        let lock_path = password_lock_path(&app)?;
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        let key = unwrap_vault_key(&old_lock_file, &current_password)?;
        let (new_lock_file, recovery_secret) = wrap_vault_key(&key, &new_password)?;
        write_password_lock_file(&app, &new_lock_file)?;
        let verified = match unwrap_vault_key(&new_lock_file, &new_password) {
            Ok(verified) if verified == key => verified,
            _ => {
                let rollback =
                    restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
                return Err(format!(
                    "新启动密码配置校验失败{}",
                    rollback
                        .err()
                        .map(|error| format!("；恢复旧启动密码配置失败：{error}"))
                        .unwrap_or_default(),
                ));
            }
        };
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
        let old_lock_bytes =
            fs::read(&lock_path).map_err(|error| format!("无法读取旧启动密码配置：{error}"))?;
        if let Err(error) = fs::remove_file(&lock_path) {
            if key_created {
                let _ = fs::remove_file(&key_path);
            }
            return Err(format!("无法关闭启动密码：{error}"));
        }
        if let Err(error) = sync_parent_directory(&lock_path) {
            let lock_restore =
                restore_private_file(&lock_path, Some(&old_lock_bytes), "启动密码配置");
            let key_cleanup = if key_created {
                fs::remove_file(&key_path)
                    .and_then(|_| {
                        #[cfg(unix)]
                        {
                            let directory = key_path
                                .parent()
                                .ok_or_else(|| std::io::Error::other("资产库路径缺少父目录"))?;
                            let directory_file = File::open(directory)?;
                            directory_file.sync_all()?;
                        }
                        Ok(())
                    })
                    .err()
            } else {
                None
            };
            return Err(format!(
                "无法同步启动密码配置，启动密码保持开启：{error}{}{}",
                lock_restore
                    .err()
                    .map(|restore_error| format!("；恢复启动密码配置失败：{restore_error}"))
                    .unwrap_or_default(),
                key_cleanup
                    .map(|cleanup_error| format!("；清理本地资产库密钥失败：{cleanup_error}"))
                    .unwrap_or_default(),
            ));
        }
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
        "app-data" => data_container_directory(&app)?,
        _ => return Err("不支持的目录类型".to_string()),
    };
    open_directory(&path)
}

#[tauri::command]
fn exit_application(app: AppHandle) {
    app.state::<ExitIntent>().0.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg(desktop)]
fn request_application_exit(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        let _ = app.emit("tray-exit-requested", ());
    } else {
        // Low-memory background mode has already completed the save and
        // cleanup sequence before destroying the main WebView, so there is no
        // frontend listener left to perform the normal exit handshake.
        exit_application(app.clone());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    builder = builder.manage(VaultSession(Mutex::new(None)));
    builder = builder.manage(ExitIntent::default());
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            #[cfg(target_os = "macos")]
            let _ = app.show();

            restore_main_window(app);
        }));
        builder = builder.plugin(
            tauri_plugin_autostart::Builder::new()
                .arg(AUTOSTART_LAUNCH_ARGUMENT)
                .build(),
        );
        builder = builder.on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent the native close action immediately. The frontend then
                // flushes pending data, locks the vault when enabled, and either
                // hides or destroys the window so the process remains available
                // from the tray.
                api.prevent_close();
                let _ = window.emit("window-close-requested", ());
            }
        });
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::PhysicalSize;

            let launched_from_autostart =
                std::env::args().any(|argument| argument == AUTOSTART_LAUNCH_ARGUMENT);
            if !launched_from_autostart {
                let Some(config) = app
                    .config()
                    .app
                    .windows
                    .iter()
                    .find(|window| window.label == "main")
                    .cloned()
                else {
                    return Err("未找到 main 窗口配置，无法启动应用".into());
                };
                let window = WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
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
                let _ = window.show();
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
                            request_application_exit(app);
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    // A live main window still needs the frontend save/lock handshake;
                    // low-memory mode destroys the main WebView, so the tray process
                    // must also cancel the implicit exit caused by removing the last
                    // window. Only the explicit tray exit command may terminate the
                    // process.
                    if !app.state::<ExitIntent>().0.swap(false, Ordering::SeqCst) {
                        api.prevent_exit();
                        if app.get_webview_window("main").is_some() {
                            let _ = app.emit("window-exit-requested", ());
                        }
                    }
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen {
                    has_visible_windows: false,
                    ..
                } => {
                    restore_main_window(app);
                }
                _ => {}
            }
        });
}
