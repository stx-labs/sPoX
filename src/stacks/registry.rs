//! Client for the on-chain deposit address registry.

use std::collections::BTreeMap;

use bitcoin::ScriptBuf;
use clarity::types::chainstate::StacksAddress;
use clarity::vm::types::{
    ListData, ListTypeData, OptionalData, QualifiedContractIdentifier, SequenceData, TupleData,
};
use clarity::vm::{ClarityName, ContractName, Value};
use sbtc::deposits::{DepositScriptInputs, ReclaimScriptInputs};

use crate::error::Error;
use crate::stacks::node::StacksClient;
use crate::storage::model::{MonitoredDeposit, MonitoredDepositSource};

/// Maximum number of registered addresses that can be fetched in a single call
pub const GET_ADDRESSES_MAX_IDS: u32 = 400;

/// A raw deposit address registered in the registry. The input scripts may be invalid.
#[derive(Debug, Clone, PartialEq)]
pub struct RawRegisteredDeposit {
    /// Registered deposit ID
    pub id: u64,
    /// Deposit script bytes
    pub deposit_script: Vec<u8>,
    /// Reclaim script bytes
    pub reclaim_script: Vec<u8>,
}

/// Client for querying the on-chain deposit address registry contract.
#[derive(Debug, Clone)]
pub struct DepositAddressRegistry {
    /// The deployer of the registry smart contract.
    contract_principal: StacksAddress,
    /// The name of the registry smart contract.
    contract_name: ContractName,
    /// The client used to make the requests.
    client: StacksClient,
}

impl DepositAddressRegistry {
    /// Create a new deposit address registry
    pub fn new(contract: QualifiedContractIdentifier, client: StacksClient) -> Self {
        let contract_principal = contract.issuer.into();

        Self {
            contract_name: contract.name,
            contract_principal,
            client,
        }
    }

    /// Get the next address id from the registry
    pub async fn get_next_address_id(&self) -> Result<u64, Error> {
        let result = self
            .client
            .call_read(
                &self.contract_principal,
                &self.contract_name,
                &ClarityName::from("get-next-address-id"),
                &self.contract_principal,
                &[],
            )
            .await?;

        match result {
            Value::UInt(id) => {
                u64::try_from(id).map_err(|_| Error::InvalidStacksResponse("uint is too large"))
            }
            _ => Err(Error::InvalidStacksResponse("did not get a uint")),
        }
    }

    /// Get the registered addresses from the registry for the given IDs
    pub async fn get_addresses(
        &self,
        ids: &[u64],
    ) -> Result<Vec<Option<RawRegisteredDeposit>>, Error> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        if ids.len() > GET_ADDRESSES_MAX_IDS as usize {
            return Err(Error::TooManyAddressIDs(ids.len(), GET_ADDRESSES_MAX_IDS));
        }

        let list_data: Vec<Value> = ids.iter().map(|v| Value::UInt(*v as u128)).collect();

        let list_type = ListTypeData::new_list(
            clarity::vm::types::TypeSignature::UIntType,
            GET_ADDRESSES_MAX_IDS,
        )
        .map_err(|e| Error::ClarityBadList(Box::new(clarity::vm::errors::Error::Unchecked(e))))?;

        let list = Value::list_with_type(
            &clarity::types::StacksEpochId::latest(),
            list_data,
            list_type,
        )
        .map_err(|e| Error::ClarityBadList(Box::new(e)))?;

        let arguments = [list];
        let result = self
            .client
            .call_read(
                &self.contract_principal,
                &self.contract_name,
                &ClarityName::from("get-addresses"),
                &self.contract_principal,
                &arguments,
            )
            .await?;

        let Value::Sequence(SequenceData::List(ListData { data, .. })) = result else {
            return Err(Error::InvalidStacksResponse("did not get a list"));
        };

        let mut addresses = Vec::new();

        for value in data {
            let Value::Optional(OptionalData { data }) = value else {
                return Err(Error::InvalidStacksResponse(
                    "did not get a list of options",
                ));
            };

            let entry = match data {
                Some(entry) => Some(RawRegisteredDeposit::try_from(*entry)?),
                None => None,
            };
            addresses.push(entry);
        }

        Ok(addresses)
    }
}

impl TryFrom<Value> for RawRegisteredDeposit {
    type Error = Error;
    fn try_from(value: Value) -> Result<Self, Self::Error> {
        let Value::Tuple(TupleData { mut data_map, .. }) = value else {
            return Err(Error::InvalidStacksResponse("did not get a tuple"));
        };

        let id = tuple_remove_uint(&mut data_map, "id")?;
        let deposit_script = tuple_remove_buff(&mut data_map, "deposit-script")?;
        let reclaim_script = tuple_remove_buff(&mut data_map, "reclaim-script")?;

        Ok(RawRegisteredDeposit {
            id: u64::try_from(id).map_err(|_| Error::InvalidStacksResponse("uint is too large"))?,
            deposit_script,
            reclaim_script,
        })
    }
}

impl TryFrom<RawRegisteredDeposit> for MonitoredDeposit {
    type Error = Error;
    fn try_from(deposit: RawRegisteredDeposit) -> Result<Self, Self::Error> {
        let deposit_script_inputs =
            DepositScriptInputs::parse(&ScriptBuf::from_bytes(deposit.deposit_script))?;
        let reclaim_script_inputs =
            ReclaimScriptInputs::parse(&ScriptBuf::from_bytes(deposit.reclaim_script))?;

        Ok(MonitoredDeposit {
            source: MonitoredDepositSource::Registry(deposit.id),
            deposit_script_inputs,
            reclaim_script_inputs,
        })
    }
}

fn tuple_remove_uint(
    data_map: &mut BTreeMap<ClarityName, Value>,
    field: &'static str,
) -> Result<u128, Error> {
    match data_map.remove(field) {
        Some(Value::UInt(data)) => Ok(data),
        _ => Err(Error::ClarityMissingTupleEntry(field)),
    }
}

fn tuple_remove_buff(
    data_map: &mut BTreeMap<ClarityName, Value>,
    field: &'static str,
) -> Result<Vec<u8>, Error> {
    match data_map.remove(field) {
        Some(Value::Sequence(SequenceData::Buffer(buf))) => Ok(buf.data),
        _ => Err(Error::ClarityMissingTupleEntry(field)),
    }
}

#[cfg(test)]
mod tests {
    use bitcoin::{NetworkKind, PrivateKey, PublicKey, secp256k1::SECP256K1};
    use bitcoincore_rpc::jsonrpc::serde_json;
    use clarity::{
        types::StacksEpochId,
        vm::types::{PrincipalData, TypeSignature},
    };

    use super::*;

    #[tokio::test]
    async fn get_next_address_id_works() {
        let next_id: u64 = 42;

        let clarity_value = Value::UInt(next_id as u128);
        let raw_json_response = format!(
            r#"{{"okay": true, "result":"0x{}"}}"#,
            clarity_value.serialize_to_hex().unwrap(),
        );

        // Setup our mock server
        let mut stacks_node_server = mockito::Server::new_async().await;
        let mock = stacks_node_server
            .mock("POST", "/v2/contracts/call-read/ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039/registry/get-next-address-id?tip=latest")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(&raw_json_response)
            .expect(1)
            .create();

        // Setup our Stacks client
        let client_url = url::Url::parse(stacks_node_server.url().as_str()).unwrap();
        let client = StacksClient::new(client_url).unwrap();

        // Setup our registry
        let registry = DepositAddressRegistry::new(
            QualifiedContractIdentifier::parse(
                "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039.registry",
            )
            .unwrap(),
            client.clone(),
        );

        // Make the request to the mock server
        let resp = registry.get_next_address_id().await.unwrap();

        // Assert that the response is what we expect
        assert_eq!(resp, next_id);
        mock.assert();
    }

    #[tokio::test]
    async fn get_addresses_works() {
        let signers_public_key =
            PublicKey::from_private_key(SECP256K1, &PrivateKey::generate(NetworkKind::Test)).into();
        let deposit = MonitoredDeposit {
            source: MonitoredDepositSource::Registry(123),
            deposit_script_inputs: DepositScriptInputs {
                signers_public_key,
                recipient: PrincipalData::parse("ST2FQWJMF9CGPW34ZWK8FEPNK072NEV1VKRNBBMJ9")
                    .unwrap(),
                max_fee: 456,
            },
            reclaim_script_inputs: ReclaimScriptInputs::try_new(
                987,
                ScriptBuf::from_hex("7551").unwrap(), // OP_DROP OP_TRUE
            )
            .unwrap(),
        };

        let raw_deposit = RawRegisteredDeposit {
            id: 123,
            deposit_script: deposit.deposit_script_inputs.deposit_script().to_bytes(),
            reclaim_script: deposit.reclaim_script_inputs.reclaim_script().to_bytes(),
        };

        let tuple_entries = vec![
            (ClarityName::from("id"), Value::UInt(raw_deposit.id as u128)),
            (
                ClarityName::from("deposit-script"),
                Value::buff_from(raw_deposit.deposit_script.clone()).unwrap(),
            ),
            (
                ClarityName::from("reclaim-script"),
                Value::buff_from(raw_deposit.reclaim_script.clone()).unwrap(),
            ),
        ];
        let tuple_data = TupleData::from_data(tuple_entries).unwrap();

        let list_type = ListTypeData::new_list(
            TypeSignature::new_option(clarity::vm::types::TypeSignature::TupleType(
                tuple_data.type_signature.clone(),
            ))
            .unwrap(),
            GET_ADDRESSES_MAX_IDS,
        )
        .unwrap();

        let clarity_value = Value::list_with_type(
            &StacksEpochId::latest(),
            vec![
                Value::some(Value::Tuple(tuple_data)).unwrap(),
                Value::none(),
            ],
            list_type,
        )
        .unwrap();

        let raw_json_response = format!(
            r#"{{"okay": true, "result":"0x{}"}}"#,
            clarity_value.serialize_to_hex().unwrap(),
        );

        let request_ids = vec![raw_deposit.id, raw_deposit.id + 1];

        // Setup our mock server
        let mut stacks_node_server = mockito::Server::new_async().await;

        let serialized_request_ids = Value::cons_list(
            request_ids
                .iter()
                .map(|v| Value::UInt(*v as u128))
                .collect(),
            &StacksEpochId::latest(),
        )
        .unwrap()
        .serialize_to_hex()
        .unwrap();

        let mock = stacks_node_server
            .mock("POST", "/v2/contracts/call-read/ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039/registry/get-addresses?tip=latest")
            .match_body(mockito::Matcher::PartialJson(serde_json::json!({
                "arguments": [serialized_request_ids]
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(&raw_json_response)
            .expect(1)
            .create();

        // Setup our Stacks client
        let client_url = url::Url::parse(stacks_node_server.url().as_str()).unwrap();
        let client = StacksClient::new(client_url).unwrap();

        // Setup our registry
        let registry = DepositAddressRegistry::new(
            QualifiedContractIdentifier::parse(
                "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039.registry",
            )
            .unwrap(),
            client.clone(),
        );

        // Make the request to the mock server
        let result = registry.get_addresses(&request_ids).await.unwrap();

        // Assert that the response is what we expect
        assert_eq!(result, vec![Some(raw_deposit), None]);

        let parsed_result = result
            .into_iter()
            .flatten()
            .map(MonitoredDeposit::try_from)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert_eq!(parsed_result, vec![deposit]);

        mock.assert();
    }
}
