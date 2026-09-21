use crate::settings::{AppSettingsFile, AppWindowBounds};
use crate::settings_store::load_app_settings_sync;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindowBuilder};

static MAIN_WINDOW_CREATE_LOCK: Mutex<()> = Mutex::new(());

const INITIAL_WINDOW_WIDTH_RATIO: f64 = 0.75;
const INITIAL_WINDOW_HEIGHT_RATIO: f64 = 0.75;
const MIN_WINDOW_WIDTH: u32 = 1024;
const MIN_WINDOW_HEIGHT: u32 = 720;

fn adaptive_dimension(available: u32, ratio: f64, minimum: u32) -> u32 {
    if available < minimum {
        return available.max(1);
    }
    ((available as f64 * ratio).round() as u32).clamp(minimum, available)
}

pub(crate) fn initial_window_size(work_area: (u32, u32)) -> (u32, u32) {
    (
        adaptive_dimension(work_area.0, INITIAL_WINDOW_WIDTH_RATIO, MIN_WINDOW_WIDTH),
        adaptive_dimension(work_area.1, INITIAL_WINDOW_HEIGHT_RATIO, MIN_WINDOW_HEIGHT),
    )
}

fn saved_window_bounds(app: &AppHandle) -> Option<AppWindowBounds> {
    let content = load_app_settings_sync(app).ok().flatten()?;
    let settings = serde_json::from_str::<AppSettingsFile>(&content).ok()?;
    if !settings.workspace.remember_window_bounds {
        return None;
    }
    settings.workspace.window_bounds
}

fn clamp_window_bounds(
    bounds: &AppWindowBounds,
    work_area: (i64, i64, u32, u32),
) -> AppWindowBounds {
    let (area_x, area_y, area_width, area_height) = work_area;
    let saved_width = i64::try_from(bounds.width).unwrap_or(i64::MAX);
    let saved_height = i64::try_from(bounds.height).unwrap_or(i64::MAX);
    let area_width = i64::from(area_width);
    let area_height = i64::from(area_height);
    let width = saved_width.clamp(1, area_width.max(1));
    let height = saved_height.clamp(1, area_height.max(1));
    let max_x = area_x.saturating_add(area_width).saturating_sub(width);
    let max_y = area_y.saturating_add(area_height).saturating_sub(height);
    AppWindowBounds {
        x: bounds.x.clamp(area_x, max_x.max(area_x)),
        y: bounds.y.clamp(area_y, max_y.max(area_y)),
        width: u64::try_from(width).unwrap_or(1),
        height: u64::try_from(height).unwrap_or(1),
    }
}

fn visible_window_bounds(
    window: &tauri::WebviewWindow,
    bounds: &AppWindowBounds,
) -> AppWindowBounds {
    let Ok(monitors) = window.available_monitors() else {
        return AppWindowBounds {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };
    };
    let Some(fallback) = monitors.first() else {
        return AppWindowBounds {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };
    };
    let saved_width = i64::try_from(bounds.width).unwrap_or(i64::MAX);
    let saved_height = i64::try_from(bounds.height).unwrap_or(i64::MAX);
    let saved_right = bounds.x.saturating_add(saved_width);
    let saved_bottom = bounds.y.saturating_add(saved_height);
    let work_area = monitors
        .iter()
        .find(|monitor| {
            let area = monitor.work_area();
            let area_right = i64::from(area.position.x).saturating_add(i64::from(area.size.width));
            let area_bottom =
                i64::from(area.position.y).saturating_add(i64::from(area.size.height));
            bounds.x < area_right
                && saved_right > i64::from(area.position.x)
                && bounds.y < area_bottom
                && saved_bottom > i64::from(area.position.y)
        })
        .unwrap_or(fallback)
        .work_area();
    clamp_window_bounds(
        bounds,
        (
            i64::from(work_area.position.x),
            i64::from(work_area.position.y),
            work_area.size.width,
            work_area.size.height,
        ),
    )
}

fn apply_saved_window_bounds(window: &tauri::WebviewWindow, bounds: &AppWindowBounds) {
    use tauri::{PhysicalPosition, PhysicalSize};
    let bounds = visible_window_bounds(window, bounds);

    let (Ok(x), Ok(y), Ok(width), Ok(height)) = (
        i32::try_from(bounds.x),
        i32::try_from(bounds.y),
        u32::try_from(bounds.width),
        u32::try_from(bounds.height),
    ) else {
        return;
    };
    // `outer_size` is persisted, while Tauri's `set_size` changes the inner
    // content area. Subtract the current frame so Windows does not grow the
    // rebuilt window by the title bar and border dimensions.
    let (Ok(outer_size), Ok(inner_size)) = (window.outer_size(), window.inner_size()) else {
        return;
    };
    let (inner_width, inner_height) = restored_inner_size(
        (width, height),
        (outer_size.width, outer_size.height),
        (inner_size.width, inner_size.height),
    );
    let _ = window.set_size(PhysicalSize::new(inner_width, inner_height));
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn apply_initial_window_size(window: &tauri::WebviewWindow) {
    use tauri::PhysicalSize;

    if let Ok(Some(monitor)) = window
        .current_monitor()
        .or_else(|_| window.primary_monitor())
    {
        let work_area = monitor.work_area().size;
        let (width, height) = initial_window_size((work_area.width, work_area.height));
        let _ = window.set_size(PhysicalSize::new(width, height));
        let _ = window.center();
    }
}

pub(crate) fn apply_startup_window_bounds(app: &AppHandle, window: &tauri::WebviewWindow) {
    if let Some(bounds) = saved_window_bounds(app).as_ref() {
        apply_saved_window_bounds(window, bounds);
    } else {
        apply_initial_window_size(window);
    }
}

pub(crate) fn restore_main_window(app: &AppHandle) {
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

        let saved_bounds = saved_window_bounds(&app);
        match WebviewWindowBuilder::from_config(&app, &config).and_then(|builder| builder.build()) {
            Ok(window) => {
                if let Some(bounds) = saved_bounds.as_ref() {
                    apply_saved_window_bounds(&window, bounds);
                } else {
                    apply_initial_window_size(&window);
                }
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Err(error) => eprintln!("恢复主窗口失败：{error}"),
        }
    });
}

fn restored_inner_size(saved: (u32, u32), outer: (u32, u32), inner: (u32, u32)) -> (u32, u32) {
    let frame_width = outer.0.saturating_sub(inner.0);
    let frame_height = outer.1.saturating_sub(inner.1);
    (
        saved.0.saturating_sub(frame_width).max(1),
        saved.1.saturating_sub(frame_height).max(1),
    )
}

#[cfg(test)]
mod tests {
    use super::{clamp_window_bounds, initial_window_size, restored_inner_size};

    #[test]
    fn initial_window_size_uses_work_area_ratio_and_minimums() {
        assert_eq!(initial_window_size((1920, 1080)), (1440, 810));
        assert_eq!(initial_window_size((1280, 720)), (1024, 720));
    }

    #[test]
    fn initial_window_size_does_not_exceed_small_work_area() {
        assert_eq!(initial_window_size((800, 600)), (800, 600));
    }

    #[test]
    fn saved_window_bounds_are_clamped_to_visible_work_area() {
        let bounds = super::AppWindowBounds {
            x: -500,
            y: 900,
            width: 3000,
            height: 2000,
        };
        let clamped = clamp_window_bounds(&bounds, (0, 0, 1920, 1080));
        assert_eq!(
            (clamped.x, clamped.y, clamped.width, clamped.height),
            (0, 0, 1920, 1080)
        );
    }

    #[test]
    fn restored_content_size_subtracts_window_frame() {
        assert_eq!(
            restored_inner_size((1280, 800), (1280, 800), (1264, 761)),
            (1264, 761)
        );
        assert_eq!(
            restored_inner_size((1280, 800), (1280, 800), (1280, 800)),
            (1280, 800)
        );
    }
    #[test]
    fn abnormal_frame_measurements_never_underflow_or_create_zero_size() {
        assert_eq!(restored_inner_size((1, 1), (100, 100), (10, 10)), (1, 1));
        assert_eq!(
            restored_inner_size((1280, 800), (100, 100), (200, 200)),
            (1280, 800)
        );
    }
}
