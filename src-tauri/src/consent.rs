use std::{fs, io::Read, path::PathBuf};

const MAX_SETTINGS_BYTES: u64 = 1024 * 1024;

#[derive(Clone)]
pub struct PersistedConsent {
    settings_path: PathBuf,
}

impl PersistedConsent {
    pub fn new(settings_path: PathBuf) -> Self {
        Self { settings_path }
    }

    fn setting(&self, section: &str, key: &str) -> bool {
        let mut contents = String::new();
        let read = fs::File::open(&self.settings_path)
            .map(|file| file.take(MAX_SETTINGS_BYTES + 1))
            .and_then(|mut file| file.read_to_string(&mut contents));
        if read.is_err() || contents.len() as u64 > MAX_SETTINGS_BYTES {
            return false;
        }
        serde_json::from_str::<serde_json::Value>(&contents)
            .ok()
            .and_then(|settings| {
                settings
                    .get("management")?
                    .get(section)?
                    .get(key)?
                    .as_bool()
            })
            .unwrap_or(false)
    }

    pub fn answer_granted(&self) -> bool {
        self.setting("ai", "cloudAnswerConsent")
    }

    pub fn computer_use_granted(&self) -> bool {
        self.setting("computerUse", "cloudConsent")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consent_fails_closed_and_reads_only_persisted_boolean_values() {
        let directory =
            std::env::temp_dir().join(format!("lumen-consent-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("lumen.settings.json");
        let consent = PersistedConsent::new(path.clone());

        assert!(!consent.answer_granted());
        assert!(!consent.computer_use_granted());

        fs::write(
            &path,
            r#"{"management":{"ai":{"cloudAnswerConsent":true},"computerUse":{"cloudConsent":true}}}"#,
        )
        .unwrap();
        assert!(consent.answer_granted());
        assert!(consent.computer_use_granted());

        fs::write(
            &path,
            r#"{"management":{"ai":{"cloudAnswerConsent":"true"}}}"#,
        )
        .unwrap();
        assert!(!consent.answer_granted());
        assert!(!consent.computer_use_granted());

        fs::write(&path, "x".repeat((MAX_SETTINGS_BYTES + 1) as usize)).unwrap();
        assert!(!consent.answer_granted());
        assert!(!consent.computer_use_granted());

        fs::remove_dir_all(directory).unwrap();
    }
}
