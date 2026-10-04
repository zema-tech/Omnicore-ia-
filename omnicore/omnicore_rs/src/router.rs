// Router Omnicore (Rust) — mirror di src/router.ts. Stesse keyword, stesso ordine.
pub fn classify(text: &str) -> &'static str {
    const CODE: &[&str] = &[
        "fix", "bug", "refactor", "implementa", "implement", "commit", "test",
        "build", "codice", "code", "file", "repo", "pr ", "diff",
    ];
    const MEMORY: &[&str] = &[
        "ricordi", "remember", "skill", "cron", " eri ", "avevi detto",
        "riepiloga", "summar", "past", "ieri",
    ];
    let t = format!(" {} ", text.to_lowercase());
    let tt = t.as_str();
    if CODE.iter().any(|k| tt.contains(k)) {
        return "code";
    }
    if MEMORY.iter().any(|k| tt.contains(k)) {
        return "memory";
    }
    let s = tt.trim();
    if s.starts_with('/') || tt.contains("deploy") || tt.contains("gateway") {
        return "ops";
    }
    "chat"
}

pub fn route(text: &str) -> (&'static str, &'static str) {
    let intent = classify(text);
    let handler = match intent {
        "code" => "opencode",
        "memory" => "hermes",
        "ops" => "openclaw",
        _ => "hermes",
    };
    (intent, handler)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn code_wins_first() {
        assert_eq!(classify("fix login bug"), "code");
    }
    #[test]
    fn memory_hints() {
        assert_eq!(classify("ricordi cosa avevi detto ieri?"), "memory");
    }
    #[test]
    fn ops_slash() {
        assert_eq!(classify("/deploy gateway"), "ops");
    }
    #[test]
    fn chat_default() {
        assert_eq!(classify("ciao"), "chat");
        assert_eq!(route("ciao").1, "hermes");
    }
}
