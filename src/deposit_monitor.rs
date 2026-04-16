//! Module to monitor for pending deposits

use std::num::NonZeroUsize;
use std::str::FromStr as _;

use bitcoin::{BlockHash, Txid};
use emily_client::models::CreateDepositRequestBody;
use lru::LruCache;

use crate::bitcoin::{BlockRef, Utxo};
use crate::context::Context;
use crate::error::Error;
use crate::storage::Storage as _;

/// Deposit monitor
pub struct DepositMonitor {
    context: Context,
    tx_hex_cache: LruCache<(Txid, BlockHash), String>,
    created_deposits: LruCache<(Txid, u32), ()>,
}

// TODO: make cache size configurable
// As for now numbers are chosen to keep cache size around 4MB
const TX_HEX_CACHE_SIZE: NonZeroUsize =
    NonZeroUsize::new(8_000).expect("Cache size must be non-zero");

/// How many created deposits to keep track of. This should keep the max memory
/// usage below 10MB.
const CREATED_DEPOSITS_CACHE_SIZE: NonZeroUsize =
    NonZeroUsize::new(100_000).expect("Cache size must be non-zero");

impl DepositMonitor {
    /// Creates a new `DepositMonitor`
    pub fn new(context: Context) -> Self {
        Self {
            context,
            tx_hex_cache: LruCache::new(TX_HEX_CACHE_SIZE),
            created_deposits: LruCache::new(CREATED_DEPOSITS_CACHE_SIZE),
        }
    }

    /// Process a `Utxo` to get a create deposit request for Emily
    pub fn get_deposit_from_utxo(
        &mut self,
        utxo: &Utxo,
        chain_tip: &BlockRef,
    ) -> Result<CreateDepositRequestBody, Error> {
        let monitored_deposit = self
            .context
            .storage()
            .get_by_script(&utxo.script_pub_key)?
            .ok_or_else(|| Error::MissingMonitoredDeposit(utxo.script_pub_key.clone()))?;

        let unlocking_time =
            utxo.block_height + (monitored_deposit.reclaim_script_inputs.lock_time() as u64);
        if unlocking_time <= chain_tip.block_height {
            return Err(Error::DepositExpired);
        }

        let bitcoin_client = self.context.bitcoin_client();

        let block_hash = bitcoin_client.get_block_hash(utxo.block_height)?;

        let tx_hex = self
            .tx_hex_cache
            .try_get_or_insert((utxo.txid, block_hash), || {
                bitcoin_client.get_raw_transaction_hex(&utxo.txid, &block_hash)
            })?
            .clone();

        Ok(CreateDepositRequestBody {
            bitcoin_tx_output_index: utxo.vout,
            bitcoin_txid: utxo.txid.to_string(),
            deposit_script: monitored_deposit
                .deposit_script_inputs
                .deposit_script()
                .to_hex_string(),
            reclaim_script: monitored_deposit
                .reclaim_script_inputs
                .reclaim_script()
                .to_hex_string(),
            transaction_hex: tx_hex,
        })
    }

    /// Check pending deposits confirmed to the monitored addresses
    pub fn get_pending_deposits(
        &mut self,
        chain_tip: &BlockRef,
    ) -> Result<Vec<CreateDepositRequestBody>, Error> {
        let script_pubkeys = self.context.storage().get_scripts()?;
        if script_pubkeys.is_empty() {
            return Ok(Vec::new());
        }

        // TODO: batch the get_utxos call
        let utxos = self.context.bitcoin_client().get_utxos(&script_pubkeys)?;

        let create_deposits = utxos
            .iter()
            .filter_map(|utxo| {
                // Emily will nop for duplicates, still we try avoiding wasting
                // time for deposits we already created in this session.
                if self.created_deposits.get(&(utxo.txid, utxo.vout)).is_some() {
                    return None;
                }

                self.get_deposit_from_utxo(utxo, chain_tip)
                    .inspect_err(|error| match error {
                        Error::DepositExpired => tracing::info!(
                            %error,
                            txid = %utxo.txid,
                            vout = %utxo.vout,
                            block_height = %utxo.block_height,
                            "deposit is expired; skipping utxo"
                        ),
                        _ => tracing::warn!(
                            %error,
                            txid = %utxo.txid,
                            vout = %utxo.vout,
                            block_height = %utxo.block_height,
                            "failed to get deposit from utxo; skipping utxo"
                        ),
                    })
                    .ok()
            })
            .collect();

        Ok(create_deposits)
    }

    /// Mark a deposit as (locally) created
    pub fn deposit_created(&mut self, bitcoin_txid: &str, bitcoin_tx_output_index: u32) {
        match Txid::from_str(bitcoin_txid) {
            Ok(txid) => {
                self.created_deposits
                    .put((txid, bitcoin_tx_output_index), ());
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    txid = %bitcoin_txid,
                    vout = %bitcoin_tx_output_index,
                    "failed to parse transaction id"
                );
            }
        };
    }
}
