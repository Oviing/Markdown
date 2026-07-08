mod git;
mod pty;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            git::git_status,
            git::git_commit,
            git::git_push,
            git::git_branches,
            git::git_checkout,
            git::git_diff,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .on_window_event(|window, event| {
            // kill the shell here, not from JS: JS may never run during quit
            if let tauri::WindowEvent::Destroyed = event {
                pty::kill_session(&window.state::<pty::PtyState>());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
