import { STACKS_DEVNET } from '@stacks/network';
import pino, { Logger } from 'pino';
import 'dotenv/config'
import crypto from 'crypto';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { getPublicKeyFromPrivate } from '@stacks/encryption';
import { StackingClient } from '@stacks/stacking';

export let logger: Logger;
if (process.env.STACKS_LOG_JSON === '1') {
  logger = pino({
    level: process.env.LOG_LEVEL || 'debug',
  });
} else {
  logger = pino({
    level: process.env.LOG_LEVEL || 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      },
    },
  });
}

export const nodeUrl = `http://${process.env.STACKS_CORE_RPC_HOST}:${process.env.STACKS_CORE_RPC_PORT}`;
export const network = STACKS_DEVNET;

export const POX_REWARD_LENGTH = parseEnvInt('POX_REWARD_LENGTH', true);

export const MAX_U128 = 2n ** 128n - 1n;
export const maxAmount = MAX_U128;

// We use devenv signer-3 key when we need to stack 
const signer3Key = "3ec0ca5770a356d6cd1a9bfcbf6cd151eb1bd85c388cc00648ec4ef5853fdb7401";
export const signerKey = signer3Key;
export const signerStackAddr = getAddressFromPrivateKey(signerKey, network)
export const signerPubKey = getPublicKeyFromPrivate(signerKey)
export const signerStackingClient = new StackingClient({
  address: signerStackAddr,
  network,
});

export async function waitForSetup() {
  try {
    await signerStackingClient.getPoxInfo();
  } catch (error) {
    // @ts-ignore
    if (/(ECONNREFUSED|ENOTFOUND|SyntaxError)/.test(error.cause?.message)) {
      console.log(`Stacks node not ready, waiting...`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
    return waitForSetup();
  }
}

export function parseEnvInt<T extends boolean = false>(
  envKey: string,
  required?: T
): T extends true ? number : number | undefined {
  let value = process.env[envKey];
  if (typeof value === 'undefined') {
    if (required) {
      throw new Error(`Missing required env var: ${envKey}`);
    }
    return undefined as T extends true ? number : number | undefined;
  }
  return parseInt(value, 10);
}

export function burnBlockToRewardCycle(burnBlock: number) {
  const cycleLength = BigInt(POX_REWARD_LENGTH);
  return Number(BigInt(burnBlock) / cycleLength) + 1;
}

export const randInt = () => crypto.randomInt(0, 0xffffffffffff);
