mod vault_store;
use storage_paths::data_container_directory;
use vault_store::VaultSession;
mod commands;
#[cfg(desktop)]
mod native_window;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
use native_window::{apply_startup_window_bounds, restore_main_window};
mod key_wrap;
mod password_kdf;
mod private_files;
mod recovery_format;
mod settings;
mod settings_store;
mod storage_paths;
mod vault_read;
mod vault_validation;
mod vault_write;
use serde::{Deserialize, Serialize};
use std::{
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
use tauri::WebviewWindowBuilder;

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
const BACKUP_RECOVERY_REQUIRED: &str = "BACKUP_RECOVERY_REQUIRED";
const AUTOSTART_LAUNCH_ARGUMENT: &str = "--from-autostart";

#[derive(Default)]
struct ExitIntent(AtomicBool);

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct EncryptedVaultFile {
    version: u8,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
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

#[cfg(desktop)]
fn request_application_exit(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        let _ = app.emit("tray-exit-requested", ());
    } else {
        // Low-memory background mode has already completed the save and
        // cleanup sequence before destroying the main WebView, so there is no
        // frontend listener left to perform the normal exit handshake.
        commands::exit_application(app.clone());
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
                apply_startup_window_bounds(app.handle(), &window);
                let _ = window.show();
            }

            #[cfg(desktop)]
            tray::install(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_secure_vault,
            commands::save_secure_vault,
            commands::get_vault_lock_status,
            commands::setup_vault_password,
            commands::unlock_vault,
            commands::recover_vault_password,
            commands::lock_vault,
            commands::change_vault_password,
            commands::disable_vault_password,
            commands::recover_vault_backup,
            commands::exit_application,
            commands::load_app_settings,
            commands::save_app_settings,
            commands::reset_app_settings,
            commands::get_storage_info,
            commands::open_storage_path
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
