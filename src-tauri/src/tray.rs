use crate::{native_window::restore_main_window, request_application_exit};
#[cfg(target_os = "windows")]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter,
};

pub(crate) fn install(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "打开密码管理器", true, None::<&str>)?;
    let lock_item = MenuItem::with_id(app, "lock", "立即锁定", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit_item = MenuItem::with_id(app, "exit", "关闭程序", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &lock_item, &separator, &exit_item])?;
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
    Ok(())
}
