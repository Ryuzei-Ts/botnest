use napi_derive::napi;

#[napi(object)]
pub struct ParsedCommand {
    pub is_command: bool,
    pub prefix: String,
    pub command: String,
    pub payload: String,
}

#[napi]
pub fn parse_message(text: String, prefixes: Vec<String>) -> ParsedCommand {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return ParsedCommand {
            is_command: false,
            prefix: String::new(),
            command: String::new(),
            payload: String::new(),
        };
    }

    for p in &prefixes {
        if trimmed.starts_with(p) {
            let without_prefix = trimmed[p.len()..].trim_start();
            let mut parts = without_prefix.splitn(2, char::is_whitespace);
            let cmd = parts.next().unwrap_or("").to_lowercase();
            let payload = parts.next().unwrap_or("").trim().to_string();

            return ParsedCommand {
                is_command: !cmd.is_empty(),
                prefix: p.clone(),
                command: cmd,
                payload,
            };
        }
    }

    ParsedCommand {
        is_command: false,
        prefix: String::new(),
        command: String::new(),
        payload: String::new(),
    }
}

#[napi]
pub fn clean_phone_number(num: String) -> String {
    let mut cleaned: String = num.chars().filter(|c| c.is_ascii_digit()).collect();
    if cleaned.starts_with("521") && cleaned.len() == 13 {
        cleaned = format!("52{}", &cleaned[3..]);
    }
    cleaned
}
