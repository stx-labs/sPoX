import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const depositScript = Cl.buffer(new Uint8Array(32).fill(0xaa));
const reclaimScript = Cl.buffer(new Uint8Array(32).fill(0xbb));
const depositScript2 = Cl.buffer(new Uint8Array(32).fill(0xcc));
const reclaimScript2 = Cl.buffer(new Uint8Array(32).fill(0xdd));

describe("register-address", () => {
  it("registers an address and returns incrementing IDs", () => {
    const { result: r1 } = simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );
    expect(r1).toBeOk(Cl.uint(0));

    const { result: r2 } = simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript2, reclaimScript2],
      wallet2,
    );
    expect(r2).toBeOk(Cl.uint(1));
  });

  it("updates next-address-id", () => {
    const { result: initial_next_id } = simnet.callReadOnlyFn(
      "registry",
      "get-next-address-id",
      [],
      wallet1,
    );
    expect(initial_next_id).toBeUint(0);

    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );

    const { result: new_next_id } = simnet.callReadOnlyFn(
      "registry",
      "get-next-address-id",
      [],
      wallet1,
    );
    expect(new_next_id).toBeUint(1);
  });
});

describe("get-addresses", () => {
  it("returns registered addresses", () => {
    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );
    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript2, reclaimScript2],
      wallet2,
    );

    const { result } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0), Cl.uint(1)])],
      wallet1,
    );

    expect(result).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript,
            "reclaim-script": reclaimScript,
          }),
        ),
      }),
      Cl.tuple({
        id: Cl.uint(1),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript2,
            "reclaim-script": reclaimScript2,
          }),
        ),
      }),
    ]);
  });

  it("returns none for non-existent IDs", () => {
    const { result } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(999)])],
      wallet1,
    );
    expect(result).toBeList([
      Cl.tuple({
        id: Cl.uint(999),
        address: Cl.none(),
      }),
    ]);
  });
});

describe("remove-addresses", () => {
  it("rejects removal by the registrant", () => {
    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );

    const { result } = simnet.callPublicFn(
      "registry",
      "remove-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(result).toBeErr(Cl.uint(100));

    const { result: getResult } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(getResult).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript,
            "reclaim-script": reclaimScript,
          }),
        ),
      }),
    ]);
  });

  it("allows admin (deployer) to remove any address", () => {
    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );

    const { result: initialResult } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(initialResult).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript,
            "reclaim-script": reclaimScript,
          }),
        ),
      }),
    ]);

    const { result } = simnet.callPublicFn(
      "registry",
      "remove-addresses",
      [Cl.list([Cl.uint(0)])],
      deployer,
    );
    expect(result).toBeOk(Cl.list([Cl.bool(true)]));

    const { result: getResult } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(getResult).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.none(),
      }),
    ]);
  });

  it("rejects removal by unauthorized user", () => {
    simnet.callPublicFn(
      "registry",
      "register-address",
      [depositScript, reclaimScript],
      wallet1,
    );

    const { result: initialResult } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(initialResult).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript,
            "reclaim-script": reclaimScript,
          }),
        ),
      }),
    ]);

    const { result } = simnet.callPublicFn(
      "registry",
      "remove-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet2,
    );
    expect(result).toBeErr(Cl.uint(100));

    const { result: getResult } = simnet.callReadOnlyFn(
      "registry",
      "get-addresses",
      [Cl.list([Cl.uint(0)])],
      wallet1,
    );
    expect(getResult).toBeList([
      Cl.tuple({
        id: Cl.uint(0),
        address: Cl.some(
          Cl.tuple({
            "deposit-script": depositScript,
            "reclaim-script": reclaimScript,
          }),
        ),
      }),
    ]);
  });

  it("returns false for non-existent ID", () => {
    const { result } = simnet.callPublicFn(
      "registry",
      "remove-addresses",
      [Cl.list([Cl.uint(999)])],
      deployer,
    );
    expect(result).toBeOk(Cl.list([Cl.bool(false)]));
  });
});
