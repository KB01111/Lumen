use serde::{Deserialize, Serialize};
use std::{future::Future, pin::Pin};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GeneratorId {
    PrimeAgent,
    Harness2,
}

pub type GenerationFuture<'a, Candidate, Error> =
    Pin<Box<dyn Future<Output = Result<Candidate, Error>> + Send + 'a>>;

/// Generation alone grants no evaluation, storage, permission, approval or promotion authority.
/// The host supplies its existing sanitized input and candidate-manifest types.
pub trait ImprovementGenerator: Send + Sync {
    type Input: Sync;
    type Candidate;
    type Error;
    fn id(&self) -> GeneratorId;
    fn generate<'a>(
        &'a self,
        input: &'a Self::Input,
        cancel: CancellationToken,
    ) -> GenerationFuture<'a, Self::Candidate, Self::Error>;
}
