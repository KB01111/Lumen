//! Offline protocol acceptance fixture, never packaged or registered as an agent runtime.
use lumen_agent_core::memory::*;
use std::{
    io::{self, BufRead, Read},
    sync::Arc,
};
use tokio_util::sync::CancellationToken;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let core = Arc::new(MemoryCore::in_memory().expect("fixture database"));
    let scope = MemoryScope {
        project_id: "fixture-project".into(),
        session_id: None,
    };
    let review = core
        .review_native(MemoryRecord {
            source_id: "approved-note".into(),
            scope: scope.clone(),
            content: "Use approved file tools.".into(),
            provenance: Provenance {
                source: "explicit-fixture-approval".into(),
                revision: "1".into(),
            },
        })
        .expect("review");
    core.approve(&review.review_id, RetentionPolicy::Days { days: 30 })
        .await
        .expect("approval");
    let _unapproved = core
        .review_native(MemoryRecord {
            source_id: "unapproved-note".into(),
            scope: scope.clone(),
            content: "Unapproved secret.".into(),
            provenance: Provenance {
                source: "pending-fixture".into(),
                revision: "1".into(),
            },
        })
        .expect("pending review");
    let reader = core
        .bind_reader(
            scope,
            vec![NATIVE_PROVIDER.into(), BEACON_PROVIDER.into()],
            MemoryRoute::Local,
        )
        .expect("native binding");
    let mut input = io::stdin().lock();
    loop {
        let mut request = Vec::new();
        if input
            .by_ref()
            .take(2050)
            .read_until(b'\n', &mut request)
            .expect("fixture input")
            == 0
        {
            break;
        }
        if request.last() == Some(&b'\n') {
            request.pop();
            if request.last() == Some(&b'\r') {
                request.pop();
            }
        }
        let response = match reader.handle(&request, CancellationToken::new()).await {
            Ok(response) => serde_json::to_value(response).expect("fixture response"),
            Err(error) => serde_json::json!({"error": error}),
        };
        println!("{response}");
        if request.len() > 2048 {
            break;
        }
    }
}
