import fs from "fs";
import path from "path";
import {
  broadcastTransaction,
  makeContractDeploy,
  ClarityVersion,
  makeContractCall,
} from "@stacks/transactions";
import { network } from "../common";
import { bufferFromHex } from "@stacks/transactions/dist/cl";

const REGISTRY_CLAR_PATH = path.resolve(
  import.meta.dirname,
  "../../contracts/contracts/registry.clar",
);

// This is the `deployer` account in sBTC devenv
// STX Address: ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039
const DEPLOYER_KEY =
  "27e27a9c242bcf79784bb8b19c8d875e23aaf65c132d54a47c84e1a5a67bc62601";

async function broadcast(transaction: any) {
  const res = await broadcastTransaction({ transaction, network });
  if ("error" in res) {
    console.error("broadcast rejected:", res);
    process.exit(1);
  }
  console.log("txid:", res.txid);
}

async function deploy() {
  const tx = await makeContractDeploy({
    contractName: "registry",
    codeBody: fs.readFileSync(REGISTRY_CLAR_PATH, "utf8"),
    senderKey: DEPLOYER_KEY,
    network,
    clarityVersion: ClarityVersion.Clarity5,
  });
  await broadcast(tx);
}

async function add(deposit_hex: string | undefined, reclaim_hex: string | undefined) {
  if (!deposit_hex || !reclaim_hex) {
    console.error("usage: registry.ts add <deposit_hex> <reclaim_hex>");
    process.exit(1);
  }

  const tx = await makeContractCall({
    contractAddress: "ST2SBXRBJJTH7GV5J93HJ62W2NRRQ46XYBK92Y039",
    contractName: "registry",
    senderKey: DEPLOYER_KEY,
    network,
    functionName: "register-address",
    functionArgs: [bufferFromHex(deposit_hex), bufferFromHex(reclaim_hex)]
  });
  await broadcast(tx);
}

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case "deploy": return await deploy()
    case "add": return await add(process.argv[3], process.argv[4])
    default:
      console.log(`Unknown step: ${cmd}`)
  }
}

await main();
