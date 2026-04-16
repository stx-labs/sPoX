//! Configuration errors
use config::ConfigError;

/// Configuration error variants
#[derive(Debug, thiserror::Error)]
pub enum SpoxConfigError {
    /// An error returned for duration parameters that must be positive
    #[error("duration for {0} must be nonzero")]
    ZeroDurationForbidden(&'static str),

    /// Missing required Stacks config
    #[error("missing required stacks config")]
    MissingStacksConfig,

    /// Registry contract address is not a contract address
    #[error("registry contract address is not a contract address")]
    RegistryIsStandard,

    /// An error returned during parsing and building the configuration object
    #[error("cannot parse and build configuration: {0}")]
    ConfigError(#[from] ConfigError),
}
