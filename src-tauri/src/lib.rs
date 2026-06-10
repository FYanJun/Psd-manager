#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::{Manager, PhysicalSize};

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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
