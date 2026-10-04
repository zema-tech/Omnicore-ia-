// Orchestratore Omnicore (Rust, std-only): route + fusione brain->hands->face.
// Chiama gli altri linguaggi/processi via std::process (python3, opencode CLI, curl)
// cosi` resta a zero dipendenze e funziona su Termux.
// Uso: omnicore [--fuse] <testo...>
mod router;

use std::env;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn env_or(key: &str, dflt: &str) -> String {
    env::var(key).unwrap_or_else(|_| dflt.to_string())
}

/// Localizza scripts/hermes_bridge.py: OMNICORE_HOME > antenati dell'eseguibile > cwd.
fn find_bridge() -> String {
    if let Ok(home) = env::var("OMNICORE_HOME") {
        let p = std::path::Path::new(&home).join("scripts/hermes_bridge.py");
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    if let Ok(exe) = env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            if let Some(d) = dir.clone() {
                let cand = d.join("scripts/hermes_bridge.py");
                if cand.exists() {
                    return cand.to_string_lossy().into_owned();
                }
                // layout cargo: omnicore_rs/target/debug/omnicore -> risali a omnicore/
                let up = d.join("../scripts/hermes_bridge.py");
                if up.exists() {
                    return up.to_string_lossy().into_owned();
                }
                dir = d.parent().map(|p| p.to_path_buf());
            } else {
                break;
            }
        }
    }
    "scripts/hermes_bridge.py".to_string()
}

fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n")
}

/// BRAIN: scripts/hermes_bridge.py one-shot (import diretto degli handler
/// di vendors/hermes/mcp_serve.py, stdlib only). Esce sempre, niente hang.
fn brain_recall(text: &str) -> (bool, String) {
    let python = env_or("HERMES_PYTHON", "python3");
    let bridge = find_bridge();
    let args_json = format!("{{\"search\":\"{}\",\"limit\":5}}", json_escape(text));
    let out = Command::new(&python)
        .arg(&bridge)
        .arg("conversations_list")
        .arg(&args_json)
        .output();
    match out {
        Ok(o) if o.status.success() => (true, String::from_utf8_lossy(&o.stdout).chars().take(2000).collect()),
        Ok(o) => (
            false,
            format!("bridge exit {}: {}", o.status, String::from_utf8_lossy(&o.stderr).chars().take(300).collect::<String>()),
        ),
        Err(e) => (false, e.to_string().chars().take(300).collect()),
    }
}

/// FACE: curl POST {openclaw}/api/v1/admin/rpc {id,method:status} (best-effort).
fn face_status() -> (bool, String) {
    let base = env_or("OPENCLAW_URL", "http://127.0.0.1:18789");
    let token = env::var("OPENCLAW_TOKEN").unwrap_or_default();
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let url = format!("{}/api/v1/admin/rpc", base.trim_end_matches('/'));
    let body = format!("{{\"id\":\"omnicore-rs-{id}\",\"method\":\"status\",\"params\":{{}}}}");
    let mut cmd = Command::new("curl");
    cmd.args(["-s", "-m", "10", "-X", "POST", &url, "-H", "Content-Type: application/json"]);
    if !token.is_empty() {
        cmd.args(["-H", &format!("Bearer {token}")]);
    }
    cmd.args(["-d", &body]);
    match cmd.output() {
        Ok(o) if o.status.success() => (true, String::from_utf8_lossy(&o.stdout).chars().take(2000).collect()),
        Ok(o) => (
            false,
            format!("curl exit {}: {}", o.status, String::from_utf8_lossy(&o.stderr).chars().take(300).collect::<String>()),
        ),
        Err(e) => (false, e.to_string().chars().take(300).collect()),
    }
}

fn main() {
    let raw: Vec<String> = env::args().skip(1).collect();
    let fuse = raw.iter().any(|a| a == "--fuse");
    let text_parts: Vec<&str> = raw.iter().filter(|a| *a != "--fuse").map(|s| s.as_str()).collect();
    let text = if text_parts.is_empty() { "ciao".to_string() } else { text_parts.join(" ") };
    let (intent, handler) = router::route(&text);

    if !fuse {
        println!("{{\"intent\":\"{intent}\",\"handler\":\"{handler}\",\"text\":\"{}\"}}", json_escape(&text));
        return;
    }

    let (brain_ok, brain) = brain_recall(&text);
    let hands = if intent == "code" {
        "\"skipped=false; usa omnicore TS/Python per opencode run (hands)\"".to_string()
    } else {
        "\"skipped(intent!=code)\"".to_string()
    };
    let (face_ok, face) = face_status();
    println!(
        "{{\"intent\":\"{intent}\",\"handler\":\"{handler}\",\"text\":\"{}\",\"steps\":[{{\"step\":\"brain\",\"via\":\"hermes(mcp_serve.py) [rust→python]\",\"ok\":{brain_ok},\"result\":\"{}\"}},{{\"step\":\"hands\",\"via\":\"opencode [rust: delega a ts/py]\",\"ok\":true,\"result\":{hands}}},{{\"step\":\"face\",\"via\":\"openclaw(POST /api/v1/admin/rpc status) [rust→curl]\",\"ok\":{face_ok},\"result\":\"{}\"}}]}}",
        json_escape(&text),
        json_escape(&brain),
        json_escape(&face)
    );
}
