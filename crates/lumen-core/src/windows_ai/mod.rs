pub mod activation;
pub mod catalogue;
pub mod credentials;
pub mod files;
pub mod preferences;
pub mod protocol;
pub mod supervisor;
pub mod types;

pub use supervisor::WindowsAiRuntime;

pub fn queue_activations(runtime: &WindowsAiRuntime, args: &[String]) -> Vec<String> {
    let mut queued = Vec::new();
    for uri in args.iter().filter(|argument| argument.starts_with("lumen:")) {
        if let Some(activation) = runtime
            .activations
            .lock()
            .ok()
            .and_then(|mut queue| queue.enqueue(uri).ok().flatten())
        {
            queued.push(activation.activation_id);
        }
    }
    queued
}
