use std::process::Command;

fn escape_applescript_text(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run_applescript(script: &str) -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if message.contains("User canceled") || message.contains("-128") {
            return Ok(None);
        }
        return Err(if message.is_empty() {
            "文件面板打开失败".to_string()
        } else {
            message
        });
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

fn ensure_json_extension(path: String) -> String {
    if path.to_lowercase().ends_with(".json") {
        path
    } else {
        format!("{path}.json")
    }
}

#[tauri::command]
fn export_backup(contents: String, suggested_filename: String) -> Result<bool, String> {
    let filename = escape_applescript_text(&suggested_filename);
    let script = format!(
        "set backupFile to choose file name with prompt \"导出 JSON 备份\" default name \"{}\"\nPOSIX path of backupFile",
        filename
    );
    let Some(path) = run_applescript(&script)? else {
        return Ok(false);
    };
    let path = ensure_json_extension(path);

    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn import_backup() -> Result<Option<String>, String> {
    let script =
        "set backupFile to choose file with prompt \"导入 JSON 备份\" of type {\"public.json\", \"json\"}\nPOSIX path of backupFile";
    let Some(path) = run_applescript(script)? else {
        return Ok(None);
    };

    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![export_backup, import_backup])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
