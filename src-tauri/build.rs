fn main() {
    println!("cargo::rustc-check-cfg=cfg(psd_manager_portable)");
    println!("cargo:rerun-if-env-changed=PSD_MANAGER_PORTABLE");
    if std::env::var_os("PSD_MANAGER_PORTABLE").is_some_and(|value| value == "1") {
        println!("cargo:rustc-cfg=psd_manager_portable");
    }
    tauri_build::build();
}
