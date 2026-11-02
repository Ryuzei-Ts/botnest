use dashmap::DashSet;
use napi_derive::napi;
use std::sync::Arc;

#[napi]
pub struct FastSecurityRing {
    dedup_set: Arc<DashSet<String>>,
    max_capacity: usize,
}

#[napi]
impl FastSecurityRing {
    #[napi(constructor)]
    pub fn new(capacity: i32) -> Self {
        FastSecurityRing {
            dedup_set: Arc::new(DashSet::new()),
            max_capacity: capacity as usize,
        }
    }

    #[napi]
    pub fn check_and_insert(&self, event_id: String) -> bool {
        if self.dedup_set.contains(&event_id) {
            return true;
        }

        if self.dedup_set.len() >= self.max_capacity {
            if let Some(entry) = self.dedup_set.iter().next() {
                let key = entry.key().clone();
                drop(entry);
                self.dedup_set.remove(&key);
            }
        }

        self.dedup_set.insert(event_id);
        false
    }

    #[napi]
    pub fn fast_sanitize(&self, input: String) -> String {
        input
            .replace('\u{200B}', "")
            .replace('\u{200C}', "")
            .replace('\u{200D}', "")
            .replace('\u{FEFF}', "")
            .replace("\r\n", "\n")
            .trim()
            .to_string()
    }
}
