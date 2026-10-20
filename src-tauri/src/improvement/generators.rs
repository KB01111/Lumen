//! Candidate generation has no store, evaluator, promotion or approval capability.
use super::{
    docker::{DockerRuntime, ModelBroker},
    evaluation,
    types::*,
};
use futures_util::future::BoxFuture;
pub use lumen_agent_core::improvement::{GeneratorId, ImprovementGenerator};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub const MANIFEST_VERSION: u32 = 1;

/// Host-built input contains development cases and sanitized metadata only.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationInput {
    pub active_version: HarnessVersion,
    pub evidence_digest: String,
    pub config_digest: String,
    pub failures: Vec<ExecutionTrace>,
    development_cases: Value,
}
impl GenerationInput {
    pub fn new(
        base: HarnessVersion,
        config: String,
        failures: Vec<ExecutionTrace>,
    ) -> Result<Self, String> {
        if !is_digest(&config) || failures.is_empty() || failures.len() > 12 {
            return Err("Invalid sanitized generator input.".into());
        }
        for trace in &failures {
            trace.validate()?;
        }
        let evidence_digest = digest(
            serde_json::to_vec(&failures)
                .map_err(|_| "Invalid generation evidence.")?
                .as_slice(),
        );
        Ok(Self {
            active_version: base,
            evidence_digest,
            config_digest: config,
            failures,
            development_cases: evaluation::development_cases(),
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedCandidate {
    pub schema_version: u32,
    pub generator: GeneratorId,
    pub manifest: CandidateManifest,
}
impl GeneratedCandidate {
    pub fn validate(
        self,
        generator: GeneratorId,
        input: &GenerationInput,
    ) -> Result<CandidateManifest, String> {
        if self.schema_version != MANIFEST_VERSION
            || self.generator != generator
            || self.manifest.base_version != input.active_version.id
            || self.manifest.evidence_digest != input.evidence_digest
        {
            return Err(
                "Generated candidate version, generator, base or evidence binding changed.".into(),
            );
        }
        self.manifest.validate()?;
        Ok(self.manifest)
    }
}

pub type CandidateGenerator<'a> = dyn ImprovementGenerator<Input = GenerationInput, Candidate = GeneratedCandidate, Error = String>
    + 'a;

/// Preserves the existing Prime runtime without granting it evaluator/storage access.
pub struct PrimeAgentGenerator<'a> {
    pub runtime: &'a DockerRuntime,
    pub broker: Arc<dyn ModelBroker>,
}
impl ImprovementGenerator for PrimeAgentGenerator<'_> {
    type Input = GenerationInput;
    type Candidate = GeneratedCandidate;
    type Error = String;
    fn id(&self) -> GeneratorId {
        GeneratorId::PrimeAgent
    }
    fn generate<'a>(
        &'a self,
        input: &'a GenerationInput,
        cancel: CancellationToken,
    ) -> BoxFuture<'a, Result<GeneratedCandidate, String>> {
        Box::pin(async move {
            let payload = serde_json::to_value(input).map_err(|_| "Invalid generator input.")?;
            let result = self
                .runtime
                .run(payload, cancel, self.broker.clone())
                .await?;
            let manifest = serde_json::from_value(result.manifest)
                .map_err(|_| "Prime returned an invalid candidate manifest.")?;
            Ok(GeneratedCandidate {
                schema_version: MANIFEST_VERSION,
                generator: self.id(),
                manifest,
            })
        })
    }
}

/// Manifest import preparation only. No research runtime is installed or executable.
pub struct Harness2Generator;
impl Harness2Generator {
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "Prepared manifest importer; research runtime integration is explicitly deferred."
        )
    )]
    pub fn decode_manifest(bytes: &[u8]) -> Result<GeneratedCandidate, String> {
        if bytes.len() > 65_536 {
            return Err("Generated manifest exceeds its byte limit.".into());
        }
        let candidate: GeneratedCandidate =
            serde_json::from_slice(bytes).map_err(|_| "Invalid Harness2 candidate envelope.")?;
        if candidate.generator != GeneratorId::Harness2
            || candidate.schema_version != MANIFEST_VERSION
        {
            return Err("Unsupported Harness2 candidate envelope.".into());
        }
        candidate.manifest.validate()?;
        Ok(candidate)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratorDescriptor {
    pub id: GeneratorId,
    pub state: &'static str,
    pub manifest_version: u32,
}
pub fn descriptors() -> Vec<GeneratorDescriptor> {
    vec![
        GeneratorDescriptor {
            id: GeneratorId::PrimeAgent,
            state: "existingRuntime",
            manifest_version: MANIFEST_VERSION,
        },
        GeneratorDescriptor {
            id: Harness2Generator.id(),
            state: "disabledUninstalled",
            manifest_version: MANIFEST_VERSION,
        },
    ]
}
impl ImprovementGenerator for Harness2Generator {
    type Input = GenerationInput;
    type Candidate = GeneratedCandidate;
    type Error = String;
    fn id(&self) -> GeneratorId {
        GeneratorId::Harness2
    }
    fn generate<'a>(
        &'a self,
        _input: &'a GenerationInput,
        _cancel: CancellationToken,
    ) -> BoxFuture<'a, Result<GeneratedCandidate, String>> {
        Box::pin(async {
            Err("Harness2 is disabled and uninstalled; native improvement acceptance gates must be verified before research runtime integration.".into())
        })
    }
}

/// All generators cross this same validation boundary before the existing job-bound import.
pub async fn generate_candidate(
    generator: &CandidateGenerator<'_>,
    input: &GenerationInput,
    cancel: CancellationToken,
) -> Result<CandidateManifest, String> {
    if cancel.is_cancelled() {
        return Err("improvement_cancelled".into());
    }
    // The runtime owns cleanup: do not drop a running generator future on cancellation.
    let generated = generator.generate(input, cancel.clone()).await?;
    if cancel.is_cancelled() {
        return Err("improvement_cancelled".into());
    }
    generated.validate(generator.id(), input)
}
