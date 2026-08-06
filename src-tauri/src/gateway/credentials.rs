const SERVICE: &str = "com.bridgehammer.lumen.providers";
const MAX_CREDENTIAL_BYTES: usize = 8 * 1024;

fn allowed_provider(provider: &str) -> bool {
    matches!(
        provider,
        "openai" | "openrouter" | "anthropic" | "mistral" | "gemini"
    )
}

fn validated_credential(secret: &str) -> Result<&str, String> {
    let secret = secret.trim();
    if secret.is_empty() {
        return Err("Credential cannot be empty".to_owned());
    }
    if secret.len() > MAX_CREDENTIAL_BYTES {
        return Err("Credential is too large".to_owned());
    }
    if secret.chars().any(|character| character.is_control()) {
        return Err("Credential contains unsupported control characters".to_owned());
    }
    Ok(secret)
}

#[cfg(windows)]
pub fn set(provider: &str, secret: &str) -> Result<(), String> {
    if !allowed_provider(provider) {
        return Err("Unsupported credential provider".to_owned());
    }
    let secret = validated_credential(secret)?;
    keyring::Entry::new(SERVICE, provider)
        .map_err(|_| "Credential Manager is unavailable".to_owned())?
        .set_password(secret)
        .map_err(|_| "Credential Manager rejected the credential".to_owned())
}

#[cfg(windows)]
pub fn get(provider: &str) -> Option<String> {
    if !allowed_provider(provider) {
        return None;
    }
    keyring::Entry::new(SERVICE, provider)
        .ok()?
        .get_password()
        .ok()
}

#[cfg(windows)]
pub fn delete(provider: &str) -> Result<(), String> {
    if !allowed_provider(provider) {
        return Err("Unsupported credential provider".to_owned());
    }
    let entry = keyring::Entry::new(SERVICE, provider)
        .map_err(|_| "Credential Manager is unavailable".to_owned())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Credential Manager could not delete the credential".to_owned()),
    }
}

#[cfg(not(windows))]
pub fn set(_provider: &str, _secret: &str) -> Result<(), String> {
    Err("Windows Credential Manager is required".to_owned())
}

#[cfg(not(windows))]
pub fn get(_provider: &str) -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn delete(_provider: &str) -> Result<(), String> {
    Err("Windows Credential Manager is required".to_owned())
}

#[tauri::command]
pub fn set_provider_credential(provider: String, credential: String) -> Result<(), String> {
    set(&provider, &credential)
}

#[tauri::command]
pub fn delete_provider_credential(provider: String) -> Result<(), String> {
    delete(&provider)
}

#[tauri::command]
pub fn provider_credential_status(provider: String) -> bool {
    get(&provider).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_are_trimmed_and_bounded_before_storage() {
        assert_eq!(
            validated_credential("  sk-example  ").unwrap(),
            "sk-example"
        );
        assert!(validated_credential("  ").is_err());
        assert!(validated_credential("line\nbreak").is_err());
        assert!(validated_credential(&"x".repeat(MAX_CREDENTIAL_BYTES + 1)).is_err());
    }

    #[test]
    fn only_explicit_provider_names_are_accepted() {
        assert!(allowed_provider("openai"));
        assert!(!allowed_provider("../openai"));
        assert!(!allowed_provider("OPENAI"));
    }
}
