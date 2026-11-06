use crate::vault_validation::is_valid_uuid;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettingsFile {
    interface: AppInterfaceSettings,
    pub(crate) workspace: AppWorkspaceSettings,
    password_generator: AppGeneratorSettings,
}

impl AppSettingsFile {
    pub(crate) fn theme_preference(&self) -> &str {
        &self.interface.theme
    }
}

fn discard_legacy_density<'de, Deserializer>(
    deserializer: Deserializer,
) -> Result<(), Deserializer::Error>
where
    Deserializer: serde::Deserializer<'de>,
{
    let legacy_value = String::deserialize(deserializer)?;
    if matches!(legacy_value.as_str(), "standard" | "compact") {
        Ok(())
    } else {
        Err(serde::de::Error::custom(
            "已移除的旧字段 interface.density 的值不受支持",
        ))
    }
}

fn discard_legacy_background_mode<'de, Deserializer>(
    deserializer: Deserializer,
) -> Result<(), Deserializer::Error>
where
    Deserializer: serde::Deserializer<'de>,
{
    bool::deserialize(deserializer)?;
    Ok(())
}

fn discard_legacy_font_size<'de, Deserializer>(
    deserializer: Deserializer,
) -> Result<(), Deserializer::Error>
where
    Deserializer: serde::Deserializer<'de>,
{
    let legacy_value = u64::deserialize(deserializer)?;
    if (10..=20).contains(&legacy_value) {
        Ok(())
    } else {
        Err(serde::de::Error::custom(
            "已移除的旧字段 interface.fontSize 超出范围",
        ))
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct AppInterfaceSettings {
    tooltip_enabled: bool,
    theme: String,
    #[serde(
        default,
        rename = "density",
        skip_serializing,
        deserialize_with = "discard_legacy_density"
    )]
    _legacy_density: (),
    #[serde(
        default,
        rename = "fontSize",
        skip_serializing,
        deserialize_with = "discard_legacy_font_size"
    )]
    _legacy_font_size: (),
    start_on_boot: bool,
    startup_lock: bool,
    auto_lock_minutes: u64,
    #[serde(
        default,
        rename = "lowMemoryBackground",
        skip_serializing,
        deserialize_with = "discard_legacy_background_mode"
    )]
    _legacy_background_mode: (),
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
    validate_setting_enum(
        &settings.interface.theme,
        "interface.theme",
        &["system", "light", "dark"],
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
        ("sidebarRatio", layout.sidebar_ratio, 0.10, 0.20),
        ("listRatio", layout.list_ratio, 0.18, 0.38),
        ("generatorRatio", layout.generator_ratio, 0.24, 0.48),
    ] {
        if !value.is_finite() || value < minimum || value > maximum {
            return Err(format!(
                "应用设置字段 workspace.paneLayout.{field} 超出范围"
            ));
        }
    }
    if let Some(bounds) = &settings.workspace.window_bounds {
        if bounds.width < u64::from(crate::native_window::LEGACY_MIN_WINDOW_WIDTH)
            || bounds.width > 10_000
            || bounds.height < u64::from(crate::native_window::MIN_WINDOW_HEIGHT)
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
            "interface":{"tooltipEnabled":true,"theme":"system","startOnBoot":false,"startupLock":false,"autoLockMinutes":0},
            "workspace":{"rememberLayout":true,"paneLayout":{"sidebarRatio":0.14,"listRatio":0.21,"generatorRatio":0.3},"deviceSortMode":"updatedDesc","deviceTypeSortMode":"default","rememberLastView":true,"rememberWindowBounds":true,"windowBounds":null,"lastView":{"deviceType":"全部设备","searchQuery":"","sortMode":"updatedDesc","selectedDeviceUuid":""}},
            "passwordGenerator":{"length":8,"useUpper":true,"useLower":true,"useNumbers":true,"useSymbols":true,"excludeSimilar":true,"preventRepeats":false,"minimumNumbers":2,"minimumSymbols":2,"allowedSymbols":"!@","excludedCharacters":""}
        })
    }
    #[test]
    fn legacy_font_settings_are_validated_and_discarded() {
        let current = settings();
        let normalized = validate_app_settings_content(&current.to_string()).unwrap();
        assert!(normalized["interface"].get("fontSize").is_none());
        for valid in [10, 13, 15, 17, 19, 20] {
            let mut value = settings();
            value["interface"]["fontSize"] = json!(valid);
            value["interface"]["theme"] = json!("dark");
            let normalized = validate_app_settings_content(&value.to_string()).unwrap();
            assert!(normalized["interface"].get("fontSize").is_none());
            assert_eq!(normalized["interface"]["theme"], json!("dark"));
            assert!(validate_app_settings_content(&normalized.to_string()).is_ok());
        }
        for invalid in [
            json!(9),
            json!(21),
            json!(14.5),
            json!("unknown"),
            json!(null),
            json!(true),
        ] {
            let mut value = settings();
            value["interface"]["fontSize"] = invalid;
            assert!(validate_app_settings_content(&value.to_string()).is_err());
        }
        let mut legacy = settings();
        legacy["interface"]["fontSize"] = json!(15);
        let duplicated =
            legacy
                .to_string()
                .replacen("\"fontSize\":15", "\"fontSize\":15,\"fontSize\":19", 1);
        assert!(validate_app_settings_content(&duplicated).is_err());
        let mut unknown = settings();
        unknown["interface"]["fontScale"] = json!(15);
        assert!(validate_app_settings_content(&unknown.to_string()).is_err());
    }
    #[test]
    fn schema_version_and_legacy_font_settings_are_rejected() {
        let mut versioned = settings();
        versioned["schemaVersion"] = json!(2);
        assert!(validate_app_settings_content(&versioned.to_string()).is_err());
        let mut legacy_font = settings();
        legacy_font["interface"]["fontSize"] = json!("standard");
        assert!(validate_app_settings_content(&legacy_font.to_string()).is_err());
    }
    #[test]
    fn legacy_density_is_validated_and_discarded() {
        for density in ["standard", "compact"] {
            let mut value = settings();
            value["interface"]["density"] = json!(density);
            value["interface"]["theme"] = json!("dark");
            let normalized = validate_app_settings_content(&value.to_string()).unwrap();
            assert!(normalized["interface"].get("density").is_none());
            assert_eq!(normalized["interface"]["theme"], json!("dark"));
            assert!(validate_app_settings_content(&normalized.to_string()).is_ok());
        }
        let normalized = validate_app_settings_content(&settings().to_string()).unwrap();
        assert!(normalized["interface"].get("density").is_none());
        for invalid in [
            json!(null),
            json!(0),
            json!(true),
            json!("dense"),
            json!({}),
        ] {
            let mut value = settings();
            value["interface"]["density"] = invalid;
            assert!(validate_app_settings_content(&value.to_string()).is_err());
        }
        let mut value = settings();
        value["interface"]["density"] = json!("compact");
        let duplicated = value.to_string().replacen(
            "\"density\":\"compact\"",
            "\"density\":\"compact\",\"density\":\"standard\"",
            1,
        );
        assert!(validate_app_settings_content(&duplicated).is_err());
        let mut value = settings();
        value["interface"]["densityMode"] = json!("compact");
        assert!(validate_app_settings_content(&value.to_string()).is_err());
    }
    #[test]
    fn legacy_background_flags_are_validated_and_discarded() {
        for flag in [true, false] {
            let mut value = settings();
            value["interface"]["lowMemoryBackground"] = json!(flag);
            value["interface"]["theme"] = json!("dark");
            let normalized = validate_app_settings_content(&value.to_string()).unwrap();
            assert!(normalized["interface"].get("lowMemoryBackground").is_none());
            assert_eq!(normalized["interface"]["theme"], json!("dark"));
            assert!(validate_app_settings_content(&normalized.to_string()).is_ok());
        }
        for invalid in [json!(null), json!(0), json!("false"), json!({})] {
            let mut value = settings();
            value["interface"]["lowMemoryBackground"] = invalid;
            assert!(validate_app_settings_content(&value.to_string()).is_err());
        }
        let mut value = settings();
        value["interface"]["lowMemoryBackground"] = json!(false);
        let duplicated = value.to_string().replacen(
            "\"lowMemoryBackground\":false",
            "\"lowMemoryBackground\":false,\"lowMemoryBackground\":true",
            1,
        );
        assert!(validate_app_settings_content(&duplicated).is_err());
    }
    #[test]
    fn current_settings_omit_background_mode_and_reject_unknown_fields() {
        let mut value = settings();
        let normalized = validate_app_settings_content(&value.to_string()).unwrap();
        assert!(normalized["interface"].get("lowMemoryBackground").is_none());
        value["interface"]["unexpected"] = json!(true);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
    }
    #[test]
    fn settings_enum_layout_and_generator_bounds_are_checked() {
        for (pointer, invalid) in [
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
    fn frontend_pane_bounds_are_accepted_by_native_settings() {
        let source = include_str!("../../src/lib/constants.ts");
        for (field, prefix) in [
            ("sidebarRatio", "SIDEBAR"),
            ("listRatio", "LIST"),
            ("generatorRatio", "GENERATOR"),
        ] {
            for bound in ["MIN", "MAX"] {
                let declaration = format!("export const {prefix}_{bound}_RATIO = ");
                let ratio = source
                    .lines()
                    .find_map(|line| line.strip_prefix(&declaration))
                    .unwrap()
                    .trim_end_matches(';')
                    .parse::<f64>()
                    .unwrap();
                let mut value = settings();
                value["workspace"]["paneLayout"][field] = json!(ratio);
                assert!(
                    validate_app_settings_content(&value.to_string()).is_ok(),
                    "{field} {bound} {ratio}"
                );
            }
        }
    }
    #[test]
    fn invalid_pane_ratios_are_rejected_and_legacy_list_ratio_remains_readable() {
        for (field, invalid) in [
            ("sidebarRatio", 0.0999),
            ("sidebarRatio", 0.2001),
            ("listRatio", 0.1799),
            ("listRatio", 0.3801),
            ("generatorRatio", 0.2399),
            ("generatorRatio", 0.4801),
        ] {
            let mut value = settings();
            value["workspace"]["paneLayout"][field] = json!(invalid);
            assert!(validate_app_settings_content(&value.to_string()).is_err());
        }
        let mut legacy = settings();
        legacy["workspace"]["paneLayout"]["listRatio"] = json!(0.18);
        assert!(validate_app_settings_content(&legacy.to_string()).is_ok());
    }
    #[test]
    fn window_size_and_position_limits_are_checked() {
        let mut value = settings();
        value["workspace"]["windowBounds"] =
            json!({"x":-100000,"y":100000,"width":786,"height":720});
        assert!(validate_app_settings_content(&value.to_string()).is_ok());
        value["workspace"]["windowBounds"]["width"] = json!(785);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
        value["workspace"]["windowBounds"]["width"] = json!(786);
        value["workspace"]["windowBounds"]["x"] = json!(-100001);
        assert!(validate_app_settings_content(&value.to_string()).is_err());
    }
}
