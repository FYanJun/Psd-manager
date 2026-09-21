use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
};

pub(crate) fn write_private_bytes(path: &Path, bytes: &[u8], label: &str) -> Result<(), String> {
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

pub(crate) fn replace_file_with_rollback(
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

pub(crate) fn restore_private_file(
    path: &Path,
    previous: Option<&[u8]>,
    label: &str,
) -> Result<(), String> {
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

pub(crate) fn sync_parent_directory(path: &Path) -> Result<(), String> {
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

pub(crate) fn restrict_private_directory(path: &Path, description: &str) -> Result<(), String> {
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

pub(crate) fn restrict_private_file(path: &Path, description: &str) -> Result<(), String> {
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

#[cfg(test)]
mod private_file_tests {
    use super::*;
    use std::{
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "psd-file-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn private_write_replaces_contents_and_restore_recovers_or_removes() {
        let dir = TestDirectory::new();
        let target = dir.0.join("sample.bin");
        write_private_bytes(&target, b"original", "测试").unwrap();
        write_private_bytes(&target, b"updated", "测试").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"updated");
        assert!(!target.with_extension("tmp").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&target).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        restore_private_file(&target, Some(b"original"), "测试").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"original");
        restore_private_file(&target, None, "测试").unwrap();
        assert!(!target.exists());
    }
    #[test]
    fn missing_replacement_source_restores_existing_target() {
        let dir = TestDirectory::new();
        let target = dir.0.join("sample.bin");
        fs::write(&target, b"keep").unwrap();
        assert!(replace_file_with_rollback(&dir.0.join("missing.tmp"), &target, "测试").is_err());
        assert_eq!(fs::read(&target).unwrap(), b"keep");
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
    }
}
