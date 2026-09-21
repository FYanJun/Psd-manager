use crate::vault_validation::is_valid_uuid;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettingsFile {
    schema_version: u64,
    interface: AppInterfaceSettings,
    pub(crate) workspace: AppWorkspaceSettings,
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
pub(crate) struct AppWorkspaceSettings {
    remember_layout: bool,
    pane_layout: AppPaneLayout,
    device_sort_mode: String,
    device_type_sort_mode: String,
    remember_last_view: bool,
    pub(crate) remember_window_bounds: bool,
    pub(crate) window_bounds: Option<AppWindowBounds>,
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
pub(crate) struct AppWindowBounds {
    pub(crate) x: i64,
    pub(crate) y: i64,
    pub(crate) width: u64,
    pub(crate) height: u64,
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

fn validate_setting_enum(value: &str, field: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("应用设置字段 {field} 的值不受支持"))
    }
}

pub(crate) fn validate_app_settings_content(content: &str) -> Result<serde_json::Value, String> {
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

#[cfg(test)]
mod settings_validation_tests {
    use super::*;
    use serde_json::{json, Value};
    fn settings() -> Value {
        json!({
            "schemaVersion":2,
            "interface":{"tooltipEnabled":true,"theme":"system","density":"standard","fontSize":"standard","startOnBoot":false,"startupLock":false,"autoLockMinutes":0},
            "workspace":{"rememberLayout":true,"paneLayout":{"sidebarRatio":0.14,"listRatio":0.21,"generatorRatio":0.3},"deviceSortMode":"updatedDesc","deviceTypeSortMode":"default","rememberLastView":true,"rememberWindowBounds":true,"windowBounds":null,"lastView":{"deviceType":"全部设备","searchQuery":"","sortMode":"updatedDesc","selectedDeviceUuid":""}},
            "passwordGenerator":{"length":8,"useUpper":true,"useLower":true,"useNumbers":true,"useSymbols":true,"excludeSimilar":true,"preventRepeats":false,"minimumNumbers":2,"minimumSymbols":2,"allowedSymbols":"!@","excludedCharacters":""}
        })
    }
    #[test]
    fn default_background_and_strict_fields_survive_serialization() {
        let mut value = settings();
        let normalized = validate_app_settings_content(&value.to_string()).unwrap();
        assert_eq!(normalized["interface"]["lowMemoryBackground"], json!(true));
        value["interface"]["unexpected"] = json!(true);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
    }
    #[test]
    fn settings_version_enum_layout_and_generator_bounds_are_checked() {
        for (pointer, invalid) in [
            ("/schemaVersion", json!(1)),
            ("/interface/theme", json!("unsupported")),
            ("/interface/autoLockMinutes", json!(10081)),
            ("/workspace/paneLayout/sidebarRatio", json!(0.21)),
            ("/workspace/lastView/selectedDeviceUuid", json!("bad")),
            ("/passwordGenerator/length", json!(2)),
            ("/passwordGenerator/minimumSymbols", json!(7)),
        ] {
            let mut value = settings();
            *value.pointer_mut(pointer).unwrap() = invalid;
            assert!(
                validate_app_settings_content(&value.to_string()).is_err(),
                "{pointer}"
            );
        }
    }
    #[test]
    fn window_size_and_position_limits_are_checked() {
        let mut value = settings();
        value["workspace"]["windowBounds"] =
            json!({"x":-100000,"y":100000,"width":1024,"height":720});
        assert!(validate_app_settings_content(&value.to_string()).is_ok());
        value["workspace"]["windowBounds"]["width"] = json!(1023);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
        value["workspace"]["windowBounds"]["width"] = json!(1024);
        value["workspace"]["windowBounds"]["x"] = json!(-100001);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
    }
}
