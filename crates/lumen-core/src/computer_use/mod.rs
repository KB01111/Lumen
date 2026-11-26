pub mod coordinator;
pub mod executor;
pub mod foreground;
pub mod gate;
pub mod policy;
pub mod protocol;
pub mod provider;
pub mod stop;
pub mod windows;

pub use coordinator::{ComputerUseSupervisor, Metrics};
pub use protocol::{
    ComputerUseEvent, ComputerUseHealth, ComputerUseRequest, EventKind, ExecutionMode, Provider,
    StopReason, TargetSelection, WindowTarget,
};
