// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_panchang,
            commands::get_panchang_range,
            commands::get_festivals,
            commands::compare_locations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
