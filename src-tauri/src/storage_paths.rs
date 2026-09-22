use crate::private_files::{restrict_private_directory, restrict_private_file};
use crate::{
    APP_SETTINGS_FILE_NAME, CONFIG_DIRECTORY_NAME, DATA_CONTAINER_NAME, DATA_DIRECTORY_NAME,
    VAULT_BACKUP_FILE_NAME, VAULT_FILE_NAME,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;
#[cfg(not(psd_manager_portable))]
use tauri::Manager;

pub(crate) fn vault_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let directory = ensure_vault_directory(app)?;
    Ok((
        directory.join(VAULT_FILE_NAME),
        directory.join(VAULT_BACKUP_FILE_NAME),
    ))
}

#[cfg(psd_manager_portable)]
fn portable_data_container_directory(executable_directory: &Path) -> PathBuf {
    executable_directory.join(DATA_CONTAINER_NAME)
}

#[cfg(psd_manager_portable)]
pub(crate) fn data_container_directory(_app: &AppHandle) -> Result<PathBuf, String> {
    Ok(portable_data_container_directory(
        &crate::installation_directory()?,
    ))
}

#[cfg(not(psd_manager_portable))]
pub(crate) fn data_container_directory(app: &AppHandle) -> Result<PathBuf, String> {
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

pub(crate) fn ensure_vault_directory(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_storage_directories(app).map(|(data, _)| data)
}

fn ensure_config_directory(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_storage_directories(app).map(|(_, config)| config)
}

pub(crate) fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_config_directory(app)?.join(APP_SETTINGS_FILE_NAME))
}

#[cfg(test)]
mod settings_migration_tests {
    use super::*;
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-migrate-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            fs::create_dir(path.join("data")).unwrap();
            fs::create_dir(path.join("config")).unwrap();
            Self(path)
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn migration_moves_only_settings_family_and_is_repeatable() {
        let dir = Scratch::new();
        let data = dir.0.join("data");
        let config = dir.0.join("config");
        for name in [
            "settings.json",
            "settings.json.tmp",
            ".settings.json.replace-backup-1",
            "vault.enc",
        ] {
            fs::write(data.join(name), name).unwrap();
        }
        migrate_legacy_settings(&data, &config).unwrap();
        migrate_legacy_settings(&data, &config).unwrap();
        for name in [
            "settings.json",
            "settings.json.tmp",
            ".settings.json.replace-backup-1",
        ] {
            assert!(!data.join(name).exists());
            assert_eq!(fs::read_to_string(config.join(name)).unwrap(), name);
        }
        assert!(data.join("vault.enc").exists());
        assert!(!config.join("vault.enc").exists());
    }
    #[test]
    fn conflict_preflight_preserves_all_old_and_new_files() {
        let dir = Scratch::new();
        let data = dir.0.join("data");
        let config = dir.0.join("config");
        fs::write(data.join("settings.json"), "old").unwrap();
        fs::write(data.join("settings.json.tmp"), "old-temp").unwrap();
        fs::write(config.join("settings.json.tmp"), "new-temp").unwrap();
        assert!(migrate_legacy_settings(&data, &config).is_err());
        assert_eq!(
            fs::read_to_string(data.join("settings.json")).unwrap(),
            "old"
        );
        assert_eq!(
            fs::read_to_string(data.join("settings.json.tmp")).unwrap(),
            "old-temp"
        );
        assert_eq!(
            fs::read_to_string(config.join("settings.json.tmp")).unwrap(),
            "new-temp"
        );
        assert!(!config.join("settings.json").exists());
    }
}

#[cfg(all(test, psd_manager_portable))]
mod portable_path_tests {
    use super::*;

    #[test]
    fn portable_container_is_created_below_the_executable_directory() {
        let executable_directory = PathBuf::from("/tmp/PsdManager");
        assert_eq!(
            portable_data_container_directory(&executable_directory),
            PathBuf::from("/tmp/PsdManager/Psd Manager")
        );
    }
}
