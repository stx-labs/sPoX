//! Contains functionality for interacting with the storage abstraction

use bitcoin::ScriptBuf;

use crate::error::Error;

pub mod memory;
pub mod model;

/// Interface for spox storage.
pub trait Storage {
    /// Add a monitored deposit. If the script pubkey already exists it's a nop.
    fn add(&self, monitored_deposit: model::MonitoredDeposit) -> Result<(), Error>;

    /// Get a monitored deposit by script pubkey.
    fn get_by_script(&self, script: &ScriptBuf) -> Result<Option<model::MonitoredDeposit>, Error>;

    /// Get the script pubkeys for monitored deposits
    fn get_scripts(&self) -> Result<Vec<ScriptBuf>, Error>;

    /// Get the last next-address-id from the registry
    fn get_last_next_address_id(&self) -> Result<u64, Error>;

    /// Set the last next-address-id from the registry
    fn set_last_next_address_id(&self, next_address_id: u64) -> Result<(), Error>;
}
