import { fetchCallReadOnlyFunction, getAddressFromPrivateKey, uintCV } from "@stacks/transactions";
import { Pox4SignatureTopic, PoxInfo, StackingClient } from '@stacks/stacking';
import { network, randInt, signerKey, maxAmount, burnBlockToRewardCycle, waitForSetup, logger, signerStackingClient, signerStackAddr, signerPubKey } from '../common';
import { Logger } from "pino";

const stackingCycles = 3;
const stackingPollingInterval = 30;


type Staker = {
    client: StackingClient;
    privateKey: string;
    btcRewardAddress: string;
};

async function info() {
    let poxInfo = await signerStackingClient.getPoxInfo();
    // @ts-ignore
    poxInfo.epochs = [];
    poxInfo.contract_versions = [];
    logger.info(poxInfo);

    const rewardSetNextCycle = await fetchCallReadOnlyFunction({
        contractAddress: "ST000000000000000000002AMW42H",
        contractName: "pox-4",
        functionName: "get-reward-set-size",
        functionArgs: [uintCV(poxInfo.current_cycle.id + 1)],
        senderAddress: signerStackAddr,
        network,
    });
    // @ts-ignore
    logger.info(`Reward cycle size for next cycle: ${rewardSetNextCycle.value}`)
}

async function ensureStacking(staker: Staker): Promise<boolean> {
    const poxInfo = await staker.client.getPoxInfo();
    if (!poxInfo.contract_id.endsWith('.pox-4')) {
        logger.info(
            {
                poxContract: poxInfo.contract_id,
            },
            `Pox contract is not .pox-4, skipping stacking (contract=${poxInfo.contract_id})`
        );
        return false;
    }

    const runLog = logger.child({
        account: staker.client.address,
        burnHeight: poxInfo.current_burnchain_block_height,
    });

    const info = await staker.client.getAccountStatus();

    if (BigInt(info.locked) === 0n) {
        runLog.info(`Account is unlocked, stack-stx required`);
        await poxStackStx(poxInfo, staker, BigInt(info.balance), runLog);
        return true;
    }

    const unlockHeightCycle = burnBlockToRewardCycle(Number(info.unlock_height));
    const nowCycle = burnBlockToRewardCycle(poxInfo.current_burnchain_block_height ?? 0);
    if (unlockHeightCycle <= nowCycle + stackingCycles) {
        runLog.info(
            `Account unlocks at cycle ${unlockHeightCycle}, which is less than current cycle ${nowCycle} + ${stackingCycles}, stack-extend required`
        );
        // We may extend multiple times if we still have an extend tx in the mempool, but that's fine
        await poxStackExtend(poxInfo, staker, runLog);
        return true;
    }

    runLog.info(
        {
            nowCycle,
            unlockCycle: unlockHeightCycle
        },
        "Account is locked for next cycles, skipping stacking"
    );
    return false;
}

async function poxStackStx(poxInfo: PoxInfo, staker: Staker, balance: bigint, logger: Logger) {
    const amountToStx = balance - 1000000n; // 1 STX

    const authId = randInt();
    const sigArgs = {
        topic: Pox4SignatureTopic.StackStx,
        poxAddress: staker.btcRewardAddress,
        rewardCycle: poxInfo.reward_cycle_id,
        period: stackingCycles,
        signerPrivateKey: signerKey,
        authId,
        maxAmount,
    } as const;

    const signerSignature = staker.client.signPoxSignature(sigArgs);

    const stackingArgs = {
        privateKey: staker.privateKey,
        cycles: stackingCycles,
        poxAddress: staker.btcRewardAddress,
        signerKey: signerPubKey,
        signerSignature,
        amountMicroStx: amountToStx,
        burnBlockHeight: poxInfo.current_burnchain_block_height,
        authId,
        maxAmount,
    };

    const stackResult = await staker.client.stack(stackingArgs);
    logger.info(
        {
            ...stackResult,
        },
        "Stack-stx tx result"
    );
}

async function poxStackExtend(poxInfo: PoxInfo, staker: Staker, logger: Logger) {
    const authId = randInt();
    const sigArgs = {
        topic: Pox4SignatureTopic.StackExtend,
        poxAddress: staker.btcRewardAddress,
        rewardCycle: poxInfo.reward_cycle_id,
        period: stackingCycles,
        signerPrivateKey: signerKey,
        authId,
        maxAmount,
    } as const;

    const signerSignature = staker.client.signPoxSignature(sigArgs);

    const stackingArgs = {
        privateKey: staker.privateKey,
        extendCycles: stackingCycles,
        poxAddress: staker.btcRewardAddress,
        signerKey: signerPubKey,
        signerSignature,
        authId,
        maxAmount,
    };
    const stackResult = await staker.client.stackExtend(stackingArgs);
    logger.info(
        {
            ...stackResult,
        },
        "Stack-extend tx result"
    );
}

async function stack(accounts: Array<string>) {
    let any_submit = false;
    for (const account of accounts) {
        const submitted = await ensureStacking(parseAccount(account));
        any_submit ||= submitted;
    }
    return any_submit;
}

function parseAccount(account: string): Staker {
    const [privateKey, btcRewardAddress] = account.split(":");
    if (!privateKey || !btcRewardAddress) throw new Error(`Invalid account format: ${account}`)

    const stackAddr = getAddressFromPrivateKey(privateKey, network)
    const client = new StackingClient({
        address: stackAddr,
        network,
    });

    return {
        client,
        privateKey,
        btcRewardAddress
    };
}

async function stackLoop(accounts: Array<string>) {
    await waitForSetup();

    while (true) {
        try {
            await stack(accounts)
        } catch (err) {
            logger.error({ err }, 'Error running stacking');
        }
        await new Promise(resolve => setTimeout(resolve, stackingPollingInterval * 1000));
    }
}

async function main() {
    const cmd = process.argv[2];

    switch (cmd) {
        case "stack": return await stack(process.argv.slice(3))
        case "loop": return await stackLoop(process.argv.slice(3))
        case "info": return await info()
        default:
            console.log(`Unknown step: ${cmd}`)
    }
}

await main();
