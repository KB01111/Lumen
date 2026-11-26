const SERVICE: &str = "com.bridgehammer.lumen.providers";

fn allowed_provider(provider: &str) -> bool {
    matches!(
        provider,
        "openai"
            | "openrouter"
            | "anthropic"
            | "mistral"
            | "gemini"
            | "google"
            | "openai-compatible"
    )
}

#[cfg(windows)]
pub fn set(provider: &str, secret: &str) -> Result<(), String> {
    if !allowed_provider(provider) {
        return Err("Unsupported credential provider".to_owned());
    }
    if secret.trim().is_empty() {
        return Err("Credential cannot be empty".to_owned());
    }
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

pub fn status(provider: &str) -> bool {
    get(provider).is_some()
}
