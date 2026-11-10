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

fn validate_local_geometry(
    layout: &AppPaneLayout,
    bounds: Option<&AppWindowBounds>,
) -> Result<(), String> {
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
    if let Some(bounds) = bounds {
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
    Ok(())
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
    validate_local_geometry(
        &settings.workspace.pane_layout,
        settings.workspace.window_bounds.as_ref(),
    )?;
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

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AppSettingsPreferences {
    interface: AppInterfaceSettings,
    workspace: AppWorkspacePreferences,
    password_generator: AppGeneratorSettings,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AppWorkspacePreferences {
    remember_layout: bool,
    device_sort_mode: String,
    device_type_sort_mode: String,
    remember_last_view: bool,
    remember_window_bounds: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AppLocalState {
    pane_layout: AppPaneLayout,
    window_bounds: Option<AppWindowBounds>,
}

pub(crate) fn default_local_state() -> serde_json::Value {
    serde_json::json!({
        "paneLayout": {"sidebarRatio": 0.15, "listRatio": 0.25, "generatorRatio": 0.32},
        "windowBounds": null,
    })
}

fn empty_last_view(sort_mode: &serde_json::Value) -> serde_json::Value {
    serde_json::json!({"deviceType": "全部设备", "searchQuery": "", "sortMode": sort_mode, "selectedDeviceUuid": ""})
}

pub(crate) fn split_settings_content(content: &str) -> Result<(String, String), String> {
    let mut preferences = validate_app_settings_content(content)?;
    let workspace = preferences["workspace"].as_object_mut().unwrap();
    let state = serde_json::json!({
        "paneLayout": workspace.remove("paneLayout").unwrap(),
        "windowBounds": workspace.remove("windowBounds").unwrap(),
    });
    workspace.remove("lastView");
    Ok((preferences.to_string(), state.to_string()))
}

// Accept exactly the current preferences structure or the validated former full
// settings file; unrelated unknown fields remain errors at both boundaries.
pub(crate) fn normalize_preferences_content(
    content: &str,
) -> Result<(String, Option<String>), String> {
    if let Ok(preferences) = serde_json::from_str::<AppSettingsPreferences>(content) {
        let value = serde_json::to_value(preferences)
            .map_err(|error| format!("无法编码应用偏好：{error}"))?;
        join_settings_content(&value.to_string(), &default_local_state().to_string())?;
        return Ok((value.to_string(), None));
    }
    let (preferences, state) = split_settings_content(content)?;
    Ok((preferences, Some(state)))
}

pub(crate) fn validate_local_state_content(content: &str) -> Result<String, String> {
    let state: AppLocalState =
        serde_json::from_str(content).map_err(|error| format!("本机状态格式不正确：{error}"))?;
    validate_local_geometry(&state.pane_layout, state.window_bounds.as_ref())?;
    serde_json::to_string(&state).map_err(|error| format!("无法编码本机状态：{error}"))
}

pub(crate) fn join_settings_content(preferences: &str, state: &str) -> Result<String, String> {
    let preferences: AppSettingsPreferences = serde_json::from_str(preferences)
        .map_err(|error| format!("应用偏好格式不正确：{error}"))?;
    let mut value =
        serde_json::to_value(preferences).map_err(|error| format!("无法编码应用偏好：{error}"))?;
    let state: serde_json::Value = serde_json::from_str(&validate_local_state_content(state)?)
        .map_err(|error| format!("无法读取本机状态：{error}"))?;
    value["workspace"]["paneLayout"] = state["paneLayout"].clone();
    value["workspace"]["windowBounds"] = state["windowBounds"].clone();
    value["workspace"]["lastView"] = empty_last_view(&value["workspace"]["deviceSortMode"]);
    Ok(validate_app_settings_content(&value.to_string())?.to_string())
}

pub(crate) fn portable_settings_content(full: &str) -> Result<String, String> {
    let mut value = validate_app_settings_content(full)?;
    value["interface"]["startOnBoot"] = false.into();
    value["interface"]["startupLock"] = false.into();
    value["workspace"]["paneLayout"] = default_local_state()["paneLayout"].clone();
    value["workspace"]["windowBounds"] = serde_json::Value::Null;
    value["workspace"]["lastView"] = empty_last_view(&value["workspace"]["deviceSortMode"]);
    Ok(value.to_string())
}

pub(crate) fn merge_portable_settings(current: &str, imported: &str) -> Result<String, String> {
    let mut current = validate_app_settings_content(current)?;
    let imported = validate_app_settings_content(imported)?;
    for field in ["theme", "tooltipEnabled"] {
        current["interface"][field] = imported["interface"][field].clone();
    }
    current["passwordGenerator"] = imported["passwordGenerator"].clone();
    for field in [
        "rememberLayout",
        "deviceSortMode",
        "deviceTypeSortMode",
        "rememberLastView",
        "rememberWindowBounds",
    ] {
        current["workspace"][field] = imported["workspace"][field].clone();
    }
    // Current security, autostart and machine geometry remain authoritative.
    // View identifiers/searches are never transplanted from another vault.
    current["workspace"]["lastView"] = empty_last_view(&current["workspace"]["deviceSortMode"]);
    Ok(current.to_string())
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
    #[test]
    fn portable_preferences_never_transplant_machine_security_or_business_state() {
        let mut current = settings();
        current["interface"]["startOnBoot"] = json!(true);
        current["interface"]["startupLock"] = json!(true);
        current["interface"]["autoLockMinutes"] = json!(12);
        current["workspace"]["windowBounds"] = json!({"x":40,"y":60,"width":1200,"height":800});
        current["workspace"]["lastView"]["searchQuery"] = json!("private-query");
        let portable: Value =
            serde_json::from_str(&portable_settings_content(&current.to_string()).unwrap())
                .unwrap();
        assert_eq!(portable["interface"]["startOnBoot"], false);
        assert_eq!(portable["interface"]["startupLock"], false);
        assert_eq!(portable["workspace"]["windowBounds"], Value::Null);
        assert_eq!(portable["workspace"]["lastView"]["searchQuery"], "");
        let mut incoming = settings();
        incoming["interface"]["theme"] = json!("dark");
        incoming["passwordGenerator"]["length"] = json!(12);
        let merged: Value = serde_json::from_str(
            &merge_portable_settings(&current.to_string(), &incoming.to_string()).unwrap(),
        )
        .unwrap();
        assert_eq!(merged["interface"]["theme"], "dark");
        assert_eq!(merged["interface"]["startOnBoot"], true);
        assert_eq!(merged["interface"]["startupLock"], true);
        assert_eq!(merged["interface"]["autoLockMinutes"], 12);
        assert_eq!(merged["workspace"]["windowBounds"]["x"], 40);
        assert_eq!(merged["passwordGenerator"]["length"], 12);
        assert_eq!(merged["workspace"]["lastView"]["searchQuery"], "");
    }
    #[test]
    fn persisted_preferences_and_state_are_strictly_validated() {
        let (preferences, state) = split_settings_content(&settings().to_string()).unwrap();
        let mut invalid: Value = serde_json::from_str(&preferences).unwrap();
        invalid["workspace"]["lastView"] = json!({"searchQuery":"should-not-persist"});
        assert!(normalize_preferences_content(&invalid.to_string()).is_err());
        let mut invalid: Value = serde_json::from_str(&state).unwrap();
        invalid["windowBounds"] = json!({"x":0,"y":0,"width":1,"height":1});
        assert!(validate_local_state_content(&invalid.to_string()).is_err());
        invalid = serde_json::from_str(&state).unwrap();
        invalid["searchQuery"] = json!("private");
        assert!(validate_local_state_content(&invalid.to_string()).is_err());
        let legacy = settings().to_string();
        let normalized = normalize_preferences_content(&legacy).unwrap();
        assert!(normalized.1.is_some());
        assert!(normalize_preferences_content(&normalized.0)
            .unwrap()
            .1
            .is_none());
    }
    #[test]
    fn empty_views_preserve_selected_device_sort_for_portable_and_merged_preferences() {
        for mode in ["nameAsc", "typeAsc"] {
            let mut source = settings();
            source["workspace"]["deviceSortMode"] = json!(mode);
            let portable: Value =
                serde_json::from_str(&portable_settings_content(&source.to_string()).unwrap())
                    .unwrap();
            assert_eq!(portable["workspace"]["lastView"]["sortMode"], mode);
            let merged: Value = serde_json::from_str(
                &merge_portable_settings(&settings().to_string(), &source.to_string()).unwrap(),
            )
            .unwrap();
            assert_eq!(merged["workspace"]["deviceSortMode"], mode);
            assert_eq!(merged["workspace"]["lastView"]["sortMode"], mode);
        }
    }
}
