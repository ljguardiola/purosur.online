import type {
  AddProductOutcome,
  CancelLockedSaleOutcome,
  CancelSaleOutcome,
  CashBalance,
  CashChargeAnswer,
  CashCountPreview,
  ChangeLineQuantityOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  FirstPinCodeRequestOutcome,
  IdentifyLockedCloserOutcome,
  ListedCashMovement,
  OpenCashSession,
  OpenCashSessionOutcome,
  OpenSale,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
  SessionOpenSale,
  SignInLookupOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { CashMovementRequest } from "./register/cash-movement-requests";
import { answerRendererRequest, type RendererRequestDeps } from "./renderer-requests";

function deps(enrolled: boolean, overrides: Partial<RendererRequestDeps> = {}) {
  const enrolledCodes: string[] = [];
  const redemptions: { resetCode: string; newPin: string }[] = [];
  const signIns: { userId: string; pin: string }[] = [];
  const firstSignIns: { userId: string; pin: string }[] = [];
  const lookups: string[] = [];
  const codeRequests: string[] = [];
  const openings: number[] = [];
  const cashMovementRequests: CashMovementRequest[] = [];
  const closings: { sessionId: string; countedCash: number }[] = [];
  const authorizerLookups: string[] = [];
  const scans: string[] = [];
  const charges: { saleId: string; tendered: number }[] = [];
  const transferCharges: { saleId: string }[] = [];
  const searches: string[] = [];
  const additions: string[] = [];
  const kindLookups: string[] = [];
  const saleLookups: string[] = [];
  const chargeReads: { saleId: string; tendered: number }[] = [];
  const previewReads: number[] = [];
  const saleChanges: string[] = [];
  const signOuts: string[] = [];
  const failures: { context: string; error: unknown }[] = [];
  return {
    enrolledCodes,
    redemptions,
    signIns,
    firstSignIns,
    lookups,
    codeRequests,
    openings,
    cashMovementRequests,
    closings,
    authorizerLookups,
    scans,
    charges,
    transferCharges,
    searches,
    additions,
    kindLookups,
    saleLookups,
    chargeReads,
    previewReads,
    saleChanges,
    signOuts,
    failures,
    deps: {
      credentialsPresent: async () => enrolled,
      registerService: { kind: "in_service" as const },
      registerName: (): string | undefined => undefined,
      enroll: async (code: string) => {
        enrolledCodes.push(code);
        return { kind: "code_rejected" as const };
      },
      redeemPinCode: async (resetCode: string, newPin: string) => {
        redemptions.push({ resetCode, newPin });
        return { kind: "code_expired" as const };
      },
      pinPolicy: () => ({ min_digits: 6 }),
      checkEnrollmentCode: () => [],
      checkPinCodeRedemption: () => [],
      signInUsers: () => [{ id: "u1", first_name: "Ada" }],
      signIn: async (userId: string, pin: string): Promise<SignInOutcome> => {
        signIns.push({ userId, pin });
        return { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 };
      },
      firstSignIn: async (userId: string, pin: string): Promise<SignInOutcome> => {
        firstSignIns.push({ userId, pin });
        return { kind: "no_register_permission" };
      },
      signInLookup: async (email: string): Promise<SignInLookupOutcome> => {
        lookups.push(email);
        return { kind: "has_pin", user: { id: "u1", first_name: "Ada" } };
      },
      requestFirstPinCode: async (userId: string): Promise<FirstPinCodeRequestOutcome> => {
        codeRequests.push(userId);
        return { kind: "sent" };
      },
      openCashSession: async (openingFloat: number): Promise<OpenCashSessionOutcome> => {
        openings.push(openingFloat);
        return { kind: "not_permitted" };
      },
      cashSession: (): OpenCashSession | null => null,
      recordCashMovement: async (
        request: CashMovementRequest,
      ): Promise<RecordCashMovementOutcome> => {
        cashMovementRequests.push(request);
        return { kind: "no_open_session" };
      },
      cashMovements: (): ListedCashMovement[] | null => null,
      cashMovementKinds: (): RecordableCashMovementKinds | null => {
        kindLookups.push("read");
        return null;
      },
      scanProduct: async (code: string): Promise<ScanProductOutcome> => {
        scans.push(code);
        return { kind: "unknown_code" };
      },
      changeLineQuantity: async (
        lineId: string,
        quantity: number,
        expectedQuantity: number,
      ): Promise<ChangeLineQuantityOutcome> => {
        saleChanges.push(["change", lineId, quantity, expectedQuantity].join(" "));
        return { kind: "unknown_line" };
      },
      removeSaleLine: async (lineId: string): Promise<RemoveSaleLineOutcome> => {
        saleChanges.push(["remove", lineId].join(" "));
        return { kind: "unknown_line" };
      },
      cancelSale: async (): Promise<CancelSaleOutcome> => {
        saleChanges.push("cancel");
        return { kind: "no_open_sale" };
      },
      chargeSaleInCash: async (request: {
        saleId: string;
        tendered: number;
      }): Promise<ChargeSaleInCashOutcome> => {
        charges.push(request);
        return { kind: "no_open_sale" };
      },
      chargeSaleByTransfer: async (request: {
        saleId: string;
        amount: number;
      }): Promise<ChargeSaleByTransferOutcome> => {
        transferCharges.push(request);
        return { kind: "no_open_sale" };
      },
      searchProducts: async (query: string): Promise<SearchProductsOutcome> => {
        searches.push(query);
        return { kind: "results", products: [], more: false };
      },
      addProduct: async (productId: string): Promise<AddProductOutcome> => {
        additions.push(productId);
        return { kind: "product_unavailable" };
      },
      currentSale: async (): Promise<OpenSale | null> => {
        saleLookups.push("read");
        return null;
      },
      cashCharge: async (request: {
        saleId: string;
        tendered: number;
      }): Promise<CashChargeAnswer> => {
        chargeReads.push(request);
        return null;
      },
      closeCashSession: async (
        sessionId: string,
        countedCash: number,
      ): Promise<CloseCashSessionOutcome> => {
        closings.push({ sessionId, countedCash });
        return { kind: "no_open_session" };
      },
      closeLockedCashSession: async (): Promise<CloseLockedCashSessionOutcome> => ({
        kind: "no_open_session",
      }),
      cancelLockedSale: async (): Promise<CancelLockedSaleOutcome> => ({
        kind: "no_open_sale",
      }),
      identifyLockedCloser: async (): Promise<IdentifyLockedCloserOutcome> => ({
        kind: "not_locked",
      }),
      cashBalance: (): CashBalance | null => null,
      cashCountPreview: (countedCash: number): CashCountPreview | null => {
        previewReads.push(countedCash);
        return null;
      },
      lockedClosers: () => [{ id: "u2", first_name: "Grace" }],
      sessionOpenSale: (): SessionOpenSale | null => null,
      authorizers: (permission: AuthorizablePermissionKey) => {
        authorizerLookups.push(permission);
        return [{ id: "u2", first_name: "Grace" }];
      },
      signOut: () => {
        signOuts.push("signed out");
      },
      reportFailure: (context: string, error: unknown) => {
        failures.push({ context, error });
      },
      ...overrides,
    },
  };
}

describe("answerRendererRequest", () => {
  it.each([true, false])(
    "answers whether this installation is enrolled from its stored credentials: %s",
    async (enrolled) => {
      const answer = await answerRendererRequest(deps(enrolled).deps, {
        type: "enrollment-status-request",
        request_id: "r1",
      });

      expect(answer).toEqual({ type: "enrollment-status", request_id: "r1", enrolled });
    },
  );

  it.each([
    ["in_service", { kind: "in_service" }],
    ["out_of_service", { kind: "out_of_service" }],
  ] as const)(
    "answers whether the register is in service: %s",
    async (service, registerService) => {
      const answer = await answerRendererRequest(deps(true, { registerService }).deps, {
        type: "register-service-request",
        request_id: "r1",
      });

      expect(answer).toEqual({ type: "register-service", request_id: "r1", service });
    },
  );

  it("answers the register's own name as it holds it", async () => {
    const answer = await answerRendererRequest(deps(true, { registerName: () => "Caja 1" }).deps, {
      type: "register-name-request",
      request_id: "r3",
    });

    expect(answer).toEqual({ type: "register-name", request_id: "r3", name: "Caja 1" });
  });

  it.each([
    [
      { type: "check-enrollment-code", request_id: "r6", code: "p4nx" },
      { type: "enrollment-code-check", request_id: "r6", fields: ["code"] },
    ],
    [
      { type: "check-pin-code-redemption", request_id: "r7", reset_code: "p4nx", new_pin: "12" },
      { type: "pin-code-redemption-check", request_id: "r7", fields: ["reset_code", "new_pin"] },
    ],
  ] as const)("answers the check %j with the fields the core refuses", async (message, answer) => {
    const checked: unknown[] = [];
    const answered = await answerRendererRequest(
      deps(true, {
        checkEnrollmentCode: (code) => {
          checked.push(code);
          return ["code"];
        },
        checkPinCodeRedemption: (code, pin) => {
          checked.push([code, pin]);
          return ["reset_code", "new_pin"];
        },
      }).deps,
      message,
    );

    expect(answered).toEqual(answer);
    expect(checked).toHaveLength(1);
  });

  it("answers the PIN policy", async () => {
    const answer = await answerRendererRequest(
      deps(true, { pinPolicy: () => ({ min_digits: 8 }) }).deps,
      { type: "pin-policy-request", request_id: "r5" },
    );

    expect(answer).toEqual({ type: "pin-policy", request_id: "r5", min_digits: 8 });
  });

  it("answers no name while the register holds none", async () => {
    const answer = await answerRendererRequest(deps(true).deps, {
      type: "register-name-request",
      request_id: "r4",
    });

    expect(answer).toEqual({ type: "register-name", request_id: "r4", name: null });
  });

  it("enrolls with the code as typed and answers the outcome", async () => {
    const { deps: withEnroll, enrolledCodes } = deps(false);

    const answer = await answerRendererRequest(withEnroll, {
      type: "enroll",
      request_id: "r2",
      code: "p4nx 7kwe",
    });

    expect(enrolledCodes).toEqual(["p4nx 7kwe"]);
    expect(answer).toEqual({
      type: "enrollment-result",
      request_id: "r2",
      outcome: { kind: "code_rejected" },
    });
  });

  it("redeems the PIN code as typed and answers the outcome", async () => {
    const { deps: withRedeem, redemptions } = deps(true);

    const answer = await answerRendererRequest(withRedeem, {
      type: "redeem-pin-code",
      request_id: "r3",
      reset_code: "k7qm 2xpa 3dtr 4hwn",
      new_pin: "482915",
    });

    expect(redemptions).toEqual([{ resetCode: "k7qm 2xpa 3dtr 4hwn", newPin: "482915" }]);
    expect(answer).toEqual({
      type: "pin-code-redemption-result",
      request_id: "r3",
      outcome: { kind: "code_expired" },
    });
  });

  it("answers with the users who can sign in", async () => {
    const answer = await answerRendererRequest(deps(true).deps, {
      type: "sign-in-users",
      request_id: "r3",
    });

    expect(answer).toEqual({
      type: "sign-in-users",
      request_id: "r3",
      users: [{ id: "u1", first_name: "Ada" }],
    });
  });

  it("answers that the users cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      signInUsers: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, { type: "sign-in-users", request_id: "r4" }),
    ).toEqual({ type: "sign-in-users-unavailable", request_id: "r4" });
    expect(failing.failures).toEqual([{ context: "reading the users who can sign in", error }]);
  });

  it("answers that the users cannot be read when the register has no database", async () => {
    const withoutDatabase = deps(true, { signInUsers: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "sign-in-users",
        request_id: "r5",
      }),
    ).toEqual({ type: "sign-in-users-unavailable", request_id: "r5" });
  });

  it("answers with the people who can authorize the permission asked for", async () => {
    const { deps: withAuthorizers, authorizerLookups } = deps(true);

    const answer = await answerRendererRequest(withAuthorizers, {
      type: "authorizers",
      request_id: "r10",
      permission: "record_cash_in",
    });

    expect(authorizerLookups).toEqual(["record_cash_in"]);
    expect(answer).toEqual({
      type: "authorizers",
      request_id: "r10",
      users: [{ id: "u2", first_name: "Grace" }],
    });
  });

  it("answers with the people who may close a locked register", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "locked-closers-request",
        request_id: "r13",
      }),
    ).toEqual({
      type: "locked-closers",
      request_id: "r13",
      users: [{ id: "u2", first_name: "Grace" }],
    });
  });

  it("answers that the locked register's closers cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      lockedClosers: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "locked-closers-request",
        request_id: "r14",
      }),
    ).toEqual({ type: "locked-closers-unavailable", request_id: "r14" });
    expect(failing.failures).toEqual([
      { context: "reading the people who may close a locked register", error },
    ]);
  });

  it("answers that the locked register's closers cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { lockedClosers: undefined }).deps, {
        type: "locked-closers-request",
        request_id: "r18",
      }),
    ).toEqual({ type: "locked-closers-unavailable", request_id: "r18" });
  });

  it("answers that the authorizers cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      authorizers: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "authorizers",
        request_id: "r11",
        permission: "void_sale",
      }),
    ).toEqual({ type: "authorizers-unavailable", request_id: "r11" });
    expect(failing.failures).toEqual([{ context: "reading the people who can authorize", error }]);
  });

  it("answers that the authorizers cannot be read when the register has no database", async () => {
    const withoutDatabase = deps(true, { authorizers: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "authorizers",
        request_id: "r12",
        permission: "void_sale",
      }),
    ).toEqual({ type: "authorizers-unavailable", request_id: "r12" });
  });

  it("signs out and answers that nobody is signed in", async () => {
    const { deps: withSignOut, signOuts } = deps(true);

    const answer = await answerRendererRequest(withSignOut, {
      type: "sign-out",
      request_id: "r10",
    });

    expect(signOuts).toHaveLength(1);
    expect(answer).toEqual({ type: "signed-out", request_id: "r10" });
  });

  it("signs in the chosen user with the PIN as typed and answers the outcome", async () => {
    const { deps: withSignIn, signIns } = deps(true);

    const answer = await answerRendererRequest(withSignIn, {
      type: "sign-in",
      request_id: "r6",
      user_id: "u1",
      pin: "0042",
    });

    expect(signIns).toEqual([{ userId: "u1", pin: "0042" }]);
    expect(answer).toEqual({
      type: "sign-in-result",
      request_id: "r6",
      outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    });
  });

  it("answers that signing in is unavailable when it fails, and reports why", async () => {
    const error = new Error("no memory for argon2");
    const failing = deps(true, {
      signIn: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "sign-in",
        request_id: "r7",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r7", outcome: { kind: "unavailable" } });
    expect(failing.failures).toEqual([{ context: "signing in", error }]);
  });

  it("answers that signing in is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { signIn: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "sign-in",
        request_id: "r8",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r8", outcome: { kind: "unavailable" } });
  });

  it("reports nothing when the users are read and the PIN is checked", async () => {
    const { deps: working, failures } = deps(true);

    await answerRendererRequest(working, { type: "sign-in-users", request_id: "r9" });
    await answerRendererRequest(working, {
      type: "sign-in",
      request_id: "r10",
      user_id: "u1",
      pin: "0042",
    });

    expect(failures).toEqual([]);
  });

  it("opens a cash session with the float as sent and answers the outcome", async () => {
    const opened: OpenCashSessionOutcome = {
      kind: "opened",
      cash_session: {
        id: "s1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
        locked: false,
      },
    };
    const { deps: withOpening, openings } = deps(true, { openCashSession: async () => opened });
    const answer = await answerRendererRequest(withOpening, {
      type: "open-cash-session",
      request_id: "r11",
      opening_float: 5000,
    });
    const refused = deps(true);
    await answerRendererRequest(refused.deps, {
      type: "open-cash-session",
      request_id: "r12",
      opening_float: 0,
    });

    expect(answer).toEqual({
      type: "open-cash-session-result",
      request_id: "r11",
      outcome: opened,
    });
    expect(openings).toEqual([]);
    expect(refused.openings).toEqual([0]);
  });

  it("answers that opening a cash session is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      openCashSession: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "open-cash-session",
        request_id: "r13",
        opening_float: 1,
      }),
    ).toEqual({
      type: "open-cash-session-result",
      request_id: "r13",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "opening a cash session", error }]);
  });

  it("answers that opening a cash session is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { openCashSession: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "open-cash-session",
        request_id: "r14",
        opening_float: 1,
      }),
    ).toEqual({
      type: "open-cash-session-result",
      request_id: "r14",
      outcome: { kind: "unavailable" },
    });
  });

  it("answers the open cash session with who opened it", async () => {
    const session: OpenCashSession = {
      id: "s1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
      locked: false,
    };

    expect(
      await answerRendererRequest(deps(true, { cashSession: () => session }).deps, {
        type: "cash-session-request",
        request_id: "r15",
      }),
    ).toEqual({ type: "cash-session", request_id: "r15", session });
  });

  it("answers no cash session while none is open", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-session-request",
        request_id: "r16",
      }),
    ).toEqual({ type: "cash-session", request_id: "r16", session: null });
  });

  it("answers that the cash session cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashSession: undefined }).deps, {
        type: "cash-session-request",
        request_id: "r16",
      }),
    ).toEqual({ type: "cash-session-unavailable", request_id: "r16" });
  });

  it("answers that the cash session cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashSession: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-session-request",
        request_id: "r17",
      }),
    ).toEqual({ type: "cash-session-unavailable", request_id: "r17" });
    expect(failing.failures).toEqual([{ context: "reading the open cash session", error }]);
  });

  it("records a cash movement as sent, with its authorization if it has one, and answers the outcome", async () => {
    const { deps: withMovement, cashMovementRequests } = deps(true);

    const answer = await answerRendererRequest(withMovement, {
      type: "record-cash-movement",
      request_id: "r20",
      kind: "WITHDRAWAL",
      amount: 7000,
      reason: "Retiro al banco",
      authorization: { user_id: "u2", pin: "1234" },
    });

    expect(cashMovementRequests).toEqual([
      {
        kind: "WITHDRAWAL",
        amount: 7000,
        reason: "Retiro al banco",
        authorization: { user_id: "u2", pin: "1234" },
      },
    ]);
    expect(answer).toEqual({
      type: "record-cash-movement-result",
      request_id: "r20",
      outcome: { kind: "no_open_session" },
    });
  });

  it("passes no authorization when the movement has none", async () => {
    const { deps: withMovement, cashMovementRequests } = deps(true);

    await answerRendererRequest(withMovement, {
      type: "record-cash-movement",
      request_id: "r20",
      kind: "CASH_IN",
      amount: 100,
      reason: "Cambio",
    });

    expect(cashMovementRequests).toEqual([
      { kind: "CASH_IN", amount: 100, reason: "Cambio", authorization: undefined },
    ]);
  });

  it("answers that recording a cash movement is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      recordCashMovement: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "record-cash-movement",
        request_id: "r21",
        kind: "CASH_IN",
        amount: 100,
        reason: "Cambio",
      }),
    ).toEqual({
      type: "record-cash-movement-result",
      request_id: "r21",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "recording a cash movement", error }]);
  });

  it("answers that recording a cash movement is unavailable when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { recordCashMovement: undefined }).deps, {
        type: "record-cash-movement",
        request_id: "r22",
        kind: "CASH_IN",
        amount: 100,
        reason: "Cambio",
      }),
    ).toEqual({
      type: "record-cash-movement-result",
      request_id: "r22",
      outcome: { kind: "unavailable" },
    });
  });

  it("answers the open session's cash movements", async () => {
    const movements: ListedCashMovement[] = [
      {
        id: "m1",
        type: "CASH_IN",
        amount: 100,
        reason: "Cambio",
        direction: "in",
        occurred_at: "2026-09-30T12:00:00.000Z",
        actor: { user_id: "u1", first_name: "Ada" },
        authorized_by: null,
      },
    ];

    expect(
      await answerRendererRequest(deps(true, { cashMovements: () => movements }).deps, {
        type: "cash-movements-request",
        request_id: "r23",
      }),
    ).toEqual({ type: "cash-movements", request_id: "r23", movements });
  });

  it("answers no movements while no cash session is open", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-movements-request",
        request_id: "r24",
      }),
    ).toEqual({ type: "cash-movements", request_id: "r24", movements: null });
  });

  it("answers that the cash movements cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashMovements: undefined }).deps, {
        type: "cash-movements-request",
        request_id: "r25",
      }),
    ).toEqual({ type: "cash-movements-unavailable", request_id: "r25" });
  });

  it("answers that the cash movements cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashMovements: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-movements-request",
        request_id: "r26",
      }),
    ).toEqual({ type: "cash-movements-unavailable", request_id: "r26" });
    expect(failing.failures).toEqual([{ context: "reading the cash movements", error }]);
  });

  it("scans the code and answers the outcome", async () => {
    const outcome: ScanProductOutcome = { kind: "no_price", product_name: "Yerba" };
    const { deps: withScan, scans } = deps(true, {
      scanProduct: async () => outcome,
    });
    const answer = await answerRendererRequest(withScan, {
      type: "scan-product",
      request_id: "r18",
      code: "7791234567890",
    });
    const recording = deps(true);
    await answerRendererRequest(recording.deps, {
      type: "scan-product",
      request_id: "r19",
      code: "111",
    });

    expect(answer).toEqual({ type: "scan-product-result", request_id: "r18", outcome });
    expect(scans).toEqual([]);
    expect(recording.scans).toEqual(["111"]);
  });

  it("answers that scanning is unavailable when it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      scanProduct: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "scan-product",
        request_id: "r20",
        code: "1",
      }),
    ).toEqual({
      type: "scan-product-result",
      request_id: "r20",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "scanning a product", error }]);
  });

  it("answers that scanning is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { scanProduct: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "scan-product",
        request_id: "r21",
        code: "1",
      }),
    ).toEqual({
      type: "scan-product-result",
      request_id: "r21",
      outcome: { kind: "unavailable" },
    });
  });

  it("charges the sale in cash and answers the outcome", async () => {
    const outcome: ChargeSaleInCashOutcome = {
      kind: "completed",
      sale_id: "s1",
      total: 3000,
      tendered: 5000,
      change: 2000,
    };
    const { deps: withCharge, charges } = deps(true, { chargeSaleInCash: async () => outcome });
    const answer = await answerRendererRequest(withCharge, {
      type: "charge-sale-in-cash",
      request_id: "r30",
      sale_id: "s1",
      tendered: 5000,
    });
    const recording = deps(true);
    await answerRendererRequest(recording.deps, {
      type: "charge-sale-in-cash",
      request_id: "r31",
      sale_id: "s2",
      tendered: 1234,
    });

    expect(answer).toEqual({ type: "charge-sale-in-cash-result", request_id: "r30", outcome });
    expect(charges).toEqual([]);
    expect(recording.charges).toEqual([{ saleId: "s2", tendered: 1234 }]);
  });

  it("answers that charging is unavailable when it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      chargeSaleInCash: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "charge-sale-in-cash",
        request_id: "r32",
        sale_id: "s1",
        tendered: 100,
      }),
    ).toEqual({
      type: "charge-sale-in-cash-result",
      request_id: "r32",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "charging a sale in cash", error }]);
  });

  it("answers that charging is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { chargeSaleInCash: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "charge-sale-in-cash",
        request_id: "r33",
        sale_id: "s1",
        tendered: 100,
      }),
    ).toEqual({
      type: "charge-sale-in-cash-result",
      request_id: "r33",
      outcome: { kind: "unavailable" },
    });
  });

  it("charges the sale by transfer and answers the outcome", async () => {
    const outcome: ChargeSaleByTransferOutcome = {
      kind: "completed",
      sale_id: "s1",
      total: 3000,
    };
    const { deps: withCharge, transferCharges } = deps(true, {
      chargeSaleByTransfer: async () => outcome,
    });
    const answer = await answerRendererRequest(withCharge, {
      type: "charge-sale-by-transfer",
      request_id: "r34",
      sale_id: "s1",
      amount: 1200,
    });
    const recording = deps(true);
    await answerRendererRequest(recording.deps, {
      type: "charge-sale-by-transfer",
      request_id: "r35",
      sale_id: "s2",
      amount: 1200,
    });

    expect(answer).toEqual({ type: "charge-sale-by-transfer-result", request_id: "r34", outcome });
    expect(transferCharges).toEqual([]);
    expect(recording.transferCharges).toEqual([{ saleId: "s2", amount: 1200 }]);
    expect(recording.charges).toEqual([]);
  });

  it("answers that charging by transfer is unavailable when it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      chargeSaleByTransfer: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "charge-sale-by-transfer",
        request_id: "r36",
        sale_id: "s1",
        amount: 1200,
      }),
    ).toEqual({
      type: "charge-sale-by-transfer-result",
      request_id: "r36",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "charging a sale by transfer", error }]);
  });

  it("answers that charging by transfer is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { chargeSaleByTransfer: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "charge-sale-by-transfer",
        request_id: "r37",
        sale_id: "s1",
        amount: 1200,
      }),
    ).toEqual({
      type: "charge-sale-by-transfer-result",
      request_id: "r37",
      outcome: { kind: "unavailable" },
    });
  });

  it("searches the products by the query and answers the outcome", async () => {
    const outcome: SearchProductsOutcome = { kind: "no_open_session" };
    const { deps: withSearch, searches } = deps(true, { searchProducts: async () => outcome });
    const recording = deps(true);

    expect(
      await answerRendererRequest(withSearch, {
        type: "search-products",
        request_id: "r30",
        query: "yer",
      }),
    ).toEqual({ type: "search-products-result", request_id: "r30", outcome });
    expect(searches).toEqual([]);
    await answerRendererRequest(recording.deps, {
      type: "search-products",
      request_id: "r31",
      query: "té",
    });
    expect(recording.searches).toEqual(["té"]);
  });

  it("answers that searching is unavailable when it fails or is not possible, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      searchProducts: async () => {
        throw error;
      },
    });
    const withoutDatabase = deps(true, { searchProducts: undefined });
    const unavailable = {
      type: "search-products-result",
      request_id: "r32",
      outcome: { kind: "unavailable" },
    };

    expect(
      await answerRendererRequest(failing.deps, {
        type: "search-products",
        request_id: "r32",
        query: "a",
      }),
    ).toEqual(unavailable);
    expect(failing.failures).toEqual([{ context: "searching products by name", error }]);
    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "search-products",
        request_id: "r32",
        query: "a",
      }),
    ).toEqual(unavailable);
  });

  it("adds the searched product by its id and answers the outcome", async () => {
    const outcome: AddProductOutcome = { kind: "no_price", product_name: "Yerba" };
    const { deps: withAdd, additions } = deps(true, { addProduct: async () => outcome });
    const recording = deps(true);

    expect(
      await answerRendererRequest(withAdd, {
        type: "add-product",
        request_id: "r33",
        product_id: "p1",
      }),
    ).toEqual({ type: "add-product-result", request_id: "r33", outcome });
    expect(additions).toEqual([]);
    await answerRendererRequest(recording.deps, {
      type: "add-product",
      request_id: "r34",
      product_id: "p7",
    });
    expect(recording.additions).toEqual(["p7"]);
  });

  it("answers that adding a product is unavailable when it fails or is not possible, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      addProduct: async () => {
        throw error;
      },
    });
    const withoutDatabase = deps(true, { addProduct: undefined });
    const unavailable = {
      type: "add-product-result",
      request_id: "r35",
      outcome: { kind: "unavailable" },
    };

    expect(
      await answerRendererRequest(failing.deps, {
        type: "add-product",
        request_id: "r35",
        product_id: "p1",
      }),
    ).toEqual(unavailable);
    expect(failing.failures).toEqual([{ context: "adding a searched product", error }]);
    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "add-product",
        request_id: "r35",
        product_id: "p1",
      }),
    ).toEqual(unavailable);
  });

  it("answers the sale in progress", async () => {
    const sale: OpenSale = {
      id: "s1",
      lines: [
        {
          id: "l1",
          product_id: "p1",
          product_name: "Yerba",
          quantity: 1,
          list_unit_price: 1500,
          discount_amount: 0,
          promotion: null,
          line_total: 1500,
        },
      ],
      total: 1500,
      paid: 0,
      pending: 1500,
      lines_editable: true,
      cancellable: true,
      charge_refusal: null,
      refunds_on_cancel: [],
      cancel_authorization_required: false,
    };
    const { deps: withSale, saleLookups } = deps(true, { currentSale: async () => sale });
    const recording = deps(true);

    expect(
      await answerRendererRequest(withSale, {
        type: "sale-request",
        request_id: "r22",
      }),
    ).toEqual({ type: "sale", request_id: "r22", sale });
    expect(saleLookups).toEqual([]);
    await answerRendererRequest(recording.deps, {
      type: "sale-request",
      request_id: "r23",
    });
    expect(recording.saleLookups).toEqual(["read"]);
  });

  it("answers no sale in progress when there is none", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "sale-request",
        request_id: "r24",
      }),
    ).toEqual({ type: "sale", request_id: "r24", sale: null });
  });

  it("answers that the person signed in may not sell", async () => {
    expect(
      await answerRendererRequest(deps(true, { currentSale: async () => "not_permitted" }).deps, {
        type: "sale-request",
        request_id: "r27",
      }),
    ).toEqual({ type: "sale-not-permitted", request_id: "r27" });
  });

  it("answers that the sale in progress cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { currentSale: undefined }).deps, {
        type: "sale-request",
        request_id: "r25",
      }),
    ).toEqual({ type: "sale-unavailable", request_id: "r25" });
  });

  it("answers that the sale in progress cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      currentSale: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "sale-request",
        request_id: "r26",
      }),
    ).toEqual({ type: "sale-unavailable", request_id: "r26" });
    expect(failing.failures).toEqual([{ context: "reading the sale in progress", error }]);
  });

  it("reads the cash movement kinds the person can record, and answers them", async () => {
    const kinds: RecordableCashMovementKinds = {
      CASH_IN: { permission: "record_cash_in", authorization_required: false },
      CASH_OUT: { permission: "record_cash_expense", authorization_required: true },
      WITHDRAWAL: { permission: "withdraw_cash", authorization_required: true },
    };
    const reading = deps(true);
    const { deps: withKinds } = deps(true, { cashMovementKinds: () => kinds });

    expect(
      await answerRendererRequest(withKinds, {
        type: "cash-movement-kinds-request",
        request_id: "r50",
      }),
    ).toEqual({ type: "cash-movement-kinds", request_id: "r50", kinds });
    await answerRendererRequest(reading.deps, {
      type: "cash-movement-kinds-request",
      request_id: "r51",
    });
    expect(reading.kindLookups).toEqual(["read"]);
  });

  it("answers no kinds when nobody is signed in", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-movement-kinds-request",
        request_id: "r52",
      }),
    ).toEqual({ type: "cash-movement-kinds", request_id: "r52", kinds: null });
  });

  it("answers that the kinds cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashMovementKinds: undefined }).deps, {
        type: "cash-movement-kinds-request",
        request_id: "r53",
      }),
    ).toEqual({ type: "cash-movement-kinds-unavailable", request_id: "r53" });
  });

  it("answers that the kinds cannot be read when reading them fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashMovementKinds: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-movement-kinds-request",
        request_id: "r54",
      }),
    ).toEqual({ type: "cash-movement-kinds-unavailable", request_id: "r54" });
    expect(failing.failures).toEqual([
      { context: "reading the cash movements the person can record", error },
    ]);
  });

  it("reads what a tendered amount needs for the sale as sent, and answers the charge", async () => {
    const charge = { kind: "covered", applied: 3000, change: 2000 } as const;
    const reading = deps(true);
    const { deps: withCharge } = deps(true, { cashCharge: async () => charge });

    expect(
      await answerRendererRequest(withCharge, {
        type: "cash-charge-request",
        request_id: "r40",
        sale_id: "s1",
        tendered: 5000,
      }),
    ).toEqual({ type: "cash-charge", request_id: "r40", charge });
    await answerRendererRequest(reading.deps, {
      type: "cash-charge-request",
      request_id: "r41",
      sale_id: "s1",
      tendered: 5000,
    });
    expect(reading.chargeReads).toEqual([{ saleId: "s1", tendered: 5000 }]);
  });

  it("answers no charge when there is no such sale in progress", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-charge-request",
        request_id: "r42",
        sale_id: "s1",
        tendered: 5000,
      }),
    ).toEqual({ type: "cash-charge", request_id: "r42", charge: null });
  });

  it("answers that the person signed in may not sell when asked for a charge", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashCharge: async () => "not_permitted" }).deps, {
        type: "cash-charge-request",
        request_id: "r43",
        sale_id: "s1",
        tendered: 5000,
      }),
    ).toEqual({ type: "cash-charge-not-permitted", request_id: "r43" });
  });

  it("answers that the charge cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashCharge: undefined }).deps, {
        type: "cash-charge-request",
        request_id: "r44",
        sale_id: "s1",
        tendered: 5000,
      }),
    ).toEqual({ type: "cash-charge-unavailable", request_id: "r44" });
  });

  it("answers that the charge cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashCharge: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-charge-request",
        request_id: "r45",
        sale_id: "s1",
        tendered: 5000,
      }),
    ).toEqual({ type: "cash-charge-unavailable", request_id: "r45" });
    expect(failing.failures).toEqual([{ context: "reading what a tendered amount needs", error }]);
  });

  it("closes a cash session with the session and the count as sent, and answers the outcome", async () => {
    const closed: CloseCashSessionOutcome = {
      kind: "closed",
      session: { id: "s1", expected_cash: 5000, counted_cash: 4800, difference: -200 },
    };
    const closing = deps(true);
    const { deps: withClosing } = deps(true, { closeCashSession: async () => closed });

    const answer = await answerRendererRequest(withClosing, {
      type: "close-cash-session",
      request_id: "r20",
      session_id: "s1",
      counted_cash: 4800,
    });
    await answerRendererRequest(closing.deps, {
      type: "close-cash-session",
      request_id: "r21",
      session_id: "s1",
      counted_cash: 4800,
    });

    expect(answer).toEqual({
      type: "close-cash-session-result",
      request_id: "r20",
      outcome: closed,
    });
    expect(closing.closings).toEqual([{ sessionId: "s1", countedCash: 4800 }]);
  });

  it("answers that closing a cash session is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      closeCashSession: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "close-cash-session",
        request_id: "r22",
        session_id: "s1",
        counted_cash: 0,
      }),
    ).toEqual({
      type: "close-cash-session-result",
      request_id: "r22",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([{ context: "closing a cash session", error }]);
  });

  it("answers that closing a cash session is unavailable when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { closeCashSession: undefined }).deps, {
        type: "close-cash-session",
        request_id: "r23",
        session_id: "s1",
        counted_cash: 0,
      }),
    ).toEqual({
      type: "close-cash-session-result",
      request_id: "r23",
      outcome: { kind: "unavailable" },
    });
  });

  it("closes a locked register's cash session with the session, the count and the closer as sent, and answers the outcome", async () => {
    const closed: CloseLockedCashSessionOutcome = {
      kind: "closed",
      session: { id: "s1", expected_cash: 5000, counted_cash: 4800, difference: -200 },
    };
    const closer = { user_id: "u2", pin: "1234" };
    const received: unknown[] = [];
    const { deps: withClosing } = deps(true, {
      closeLockedCashSession: async (sessionId, countedCash, sentCloser) => {
        received.push({ sessionId, countedCash, closer: sentCloser });
        return closed;
      },
    });

    const answer = await answerRendererRequest(withClosing, {
      type: "close-locked-cash-session",
      request_id: "r24",
      session_id: "s1",
      counted_cash: 4800,
      closer,
    });

    expect(answer).toEqual({
      type: "close-locked-cash-session-result",
      request_id: "r24",
      outcome: closed,
    });
    expect(received).toEqual([{ sessionId: "s1", countedCash: 4800, closer }]);
  });

  it("answers that closing a locked register's cash session is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      closeLockedCashSession: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "close-locked-cash-session",
        request_id: "r25",
        session_id: "s1",
        counted_cash: 0,
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "close-locked-cash-session-result",
      request_id: "r25",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([
      { context: "closing a locked register's cash session", error },
    ]);
  });

  it("answers that closing a locked register's cash session is unavailable when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { closeLockedCashSession: undefined }).deps, {
        type: "close-locked-cash-session",
        request_id: "r26",
        session_id: "s1",
        counted_cash: 0,
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "close-locked-cash-session-result",
      request_id: "r26",
      outcome: { kind: "unavailable" },
    });
  });

  it("cancels the open sale of a locked register with the closer as sent, and answers the outcome", async () => {
    const closer = { user_id: "u2", pin: "1234" };
    const received: unknown[] = [];
    const { deps: withCancelling } = deps(true, {
      cancelLockedSale: async (sentCloser) => {
        received.push(sentCloser);
        return { kind: "cancelled" };
      },
    });

    const answer = await answerRendererRequest(withCancelling, {
      type: "cancel-locked-sale",
      request_id: "r27",
      closer,
    });

    expect(answer).toEqual({
      type: "cancel-locked-sale-result",
      request_id: "r27",
      outcome: { kind: "cancelled" },
    });
    expect(received).toEqual([closer]);
  });

  it("answers that cancelling the open sale of a locked register is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      cancelLockedSale: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cancel-locked-sale",
        request_id: "r28",
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "cancel-locked-sale-result",
      request_id: "r28",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([
      { context: "cancelling the open sale of a locked register", error },
    ]);
  });

  it("answers that cancelling the open sale of a locked register is unavailable when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cancelLockedSale: undefined }).deps, {
        type: "cancel-locked-sale",
        request_id: "r29",
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "cancel-locked-sale-result",
      request_id: "r29",
      outcome: { kind: "unavailable" },
    });
  });

  it("identifies who closes a locked register with the closer as sent, and answers the outcome", async () => {
    const identified: IdentifyLockedCloserOutcome = {
      kind: "identified",
      person: { user_id: "u2", first_name: "Grace" },
    };
    const closer = { user_id: "u2", pin: "1234" };
    const received: unknown[] = [];
    const { deps: identifying } = deps(true, {
      identifyLockedCloser: async (sentCloser) => {
        received.push(sentCloser);
        return identified;
      },
    });

    const answer = await answerRendererRequest(identifying, {
      type: "identify-locked-closer",
      request_id: "r27",
      closer,
    });

    expect(answer).toEqual({
      type: "identify-locked-closer-result",
      request_id: "r27",
      outcome: identified,
    });
    expect(received).toEqual([closer]);
  });

  it("answers that identifying who closes a locked register is unavailable when it fails, and reports why", async () => {
    const error = new Error("disk full");
    const failing = deps(true, {
      identifyLockedCloser: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "identify-locked-closer",
        request_id: "r28",
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "identify-locked-closer-result",
      request_id: "r28",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toEqual([
      { context: "identifying who closes a locked register", error },
    ]);
  });

  it("answers that identifying who closes a locked register is unavailable when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { identifyLockedCloser: undefined }).deps, {
        type: "identify-locked-closer",
        request_id: "r29",
        closer: { user_id: "u2", pin: "1234" },
      }),
    ).toEqual({
      type: "identify-locked-closer-result",
      request_id: "r29",
      outcome: { kind: "unavailable" },
    });
  });

  it("answers the cash balance of the open session", async () => {
    const balance: CashBalance = {
      opening_float: { amount: 5000, direction: "in" },
      cash_sales: { amount: 0, direction: "in" },
      change_given: { amount: 0, direction: "out" },
      refunds: { amount: 0, direction: "out" },
      cash_in: { amount: 0, direction: "in" },
      expenses: { amount: 0, direction: "out" },
      withdrawals: { amount: 0, direction: "out" },
      expected: 5000,
    };

    expect(
      await answerRendererRequest(deps(true, { cashBalance: () => balance }).deps, {
        type: "cash-balance-request",
        request_id: "r24",
      }),
    ).toEqual({ type: "cash-balance", request_id: "r24", balance });
  });

  it("answers no cash balance while no session is open", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-balance-request",
        request_id: "r25",
      }),
    ).toEqual({ type: "cash-balance", request_id: "r25", balance: null });
  });

  it("answers that the cash balance cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashBalance: undefined }).deps, {
        type: "cash-balance-request",
        request_id: "r26",
      }),
    ).toEqual({ type: "cash-balance-unavailable", request_id: "r26" });
  });

  it("answers that the cash balance cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashBalance: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-balance-request",
        request_id: "r27",
      }),
    ).toEqual({ type: "cash-balance-unavailable", request_id: "r27" });
    expect(failing.failures).toEqual([{ context: "reading the cash balance", error }]);
  });

  it("answers the count preview of the open session for the counted cash sent", async () => {
    const preview: CashCountPreview = { difference: -800 };

    expect(
      await answerRendererRequest(deps(true, { cashCountPreview: () => preview }).deps, {
        type: "cash-count-preview-request",
        request_id: "r28",
        counted_cash: 4200,
      }),
    ).toEqual({ type: "cash-count-preview", request_id: "r28", preview });
  });

  it("hands the counted cash to the core to preview", async () => {
    const reading = deps(true);

    await answerRendererRequest(reading.deps, {
      type: "cash-count-preview-request",
      request_id: "r28",
      counted_cash: 4200,
    });

    expect(reading.previewReads).toEqual([4200]);
  });

  it("answers no count preview while no session is open", async () => {
    expect(
      await answerRendererRequest(deps(true).deps, {
        type: "cash-count-preview-request",
        request_id: "r29",
        counted_cash: 100,
      }),
    ).toEqual({ type: "cash-count-preview", request_id: "r29", preview: null });
  });

  it("answers that the count preview cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { cashCountPreview: undefined }).deps, {
        type: "cash-count-preview-request",
        request_id: "r31",
        counted_cash: 100,
      }),
    ).toEqual({ type: "cash-count-preview-unavailable", request_id: "r31" });
  });

  it("answers that the count preview cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      cashCountPreview: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "cash-count-preview-request",
        request_id: "r32",
        counted_cash: 100,
      }),
    ).toEqual({ type: "cash-count-preview-unavailable", request_id: "r32" });
    expect(failing.failures).toEqual([{ context: "reading the count preview", error }]);
  });

  it("answers the open sale of the session", async () => {
    const sale: SessionOpenSale = { total: 3_434_000, cancellable: true };

    expect(
      await answerRendererRequest(deps(true, { sessionOpenSale: () => sale }).deps, {
        type: "session-open-sale-request",
        request_id: "r30",
      }),
    ).toEqual({ type: "session-open-sale", request_id: "r30", sale });
  });

  it("answers that the open sale cannot be read when the register has no database", async () => {
    expect(
      await answerRendererRequest(deps(true, { sessionOpenSale: undefined }).deps, {
        type: "session-open-sale-request",
        request_id: "r31",
      }),
    ).toEqual({ type: "session-open-sale-unavailable", request_id: "r31" });
  });

  it("answers that the open sale cannot be read when reading it fails, and reports why", async () => {
    const error = new Error("database is locked");
    const failing = deps(true, {
      sessionOpenSale: () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "session-open-sale-request",
        request_id: "r32",
      }),
    ).toEqual({ type: "session-open-sale-unavailable", request_id: "r32" });
    expect(failing.failures).toEqual([{ context: "reading the open sale", error }]);
  });

  it("answers nothing to a ping", async () => {
    expect(await answerRendererRequest(deps(true).deps, { type: "ping" })).toBeUndefined();
  });

  it("signs in for the first time with the chosen user and the PIN as typed", async () => {
    const { deps: withFirstSignIn, firstSignIns, signIns } = deps(true);

    const answer = await answerRendererRequest(withFirstSignIn, {
      type: "first-sign-in",
      request_id: "r13",
      user_id: "u1",
      pin: "0042",
    });

    expect(firstSignIns).toEqual([{ userId: "u1", pin: "0042" }]);
    expect(signIns).toEqual([]);
    expect(answer).toEqual({
      type: "sign-in-result",
      request_id: "r13",
      outcome: { kind: "no_register_permission" },
    });
  });

  it("answers that a first sign-in is unavailable when it fails, and reports why", async () => {
    const error = new Error("no memory for argon2");
    const failing = deps(true, {
      firstSignIn: async () => {
        throw error;
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "first-sign-in",
        request_id: "r14",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r14", outcome: { kind: "unavailable" } });
    expect(failing.failures).toEqual([{ context: "signing in for the first time", error }]);
  });

  it("answers that a first sign-in is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { firstSignIn: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "first-sign-in",
        request_id: "r15",
        user_id: "u1",
        pin: "1",
      }),
    ).toEqual({ type: "sign-in-result", request_id: "r15", outcome: { kind: "unavailable" } });
  });

  it("looks up who signs in with the email as typed and answers the outcome", async () => {
    const { deps: withLookup, lookups } = deps(true);

    const answer = await answerRendererRequest(withLookup, {
      type: "sign-in-lookup",
      request_id: "r16",
      email: "Ada@Example.com",
    });

    expect(lookups).toEqual(["Ada@Example.com"]);
    expect(answer).toEqual({
      type: "sign-in-lookup-result",
      request_id: "r16",
      outcome: { kind: "has_pin", user: { id: "u1", first_name: "Ada" } },
    });
  });

  it("answers that the lookup is unavailable when it fails, reporting neither the email nor the error", async () => {
    const failing = deps(true, {
      signInLookup: async (email: string) => {
        throw new Error(`could not look up ${email}`);
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "sign-in-lookup",
        request_id: "r17",
        email: "ada@example.com",
      }),
    ).toEqual({
      type: "sign-in-lookup-result",
      request_id: "r17",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toHaveLength(1);
    expect(failing.failures[0]?.context).not.toContain("ada@example.com");
    expect(String(failing.failures[0]?.error)).not.toContain("ada@example.com");
  });

  it("reports the database damage a lookup fails on as it was raised", async () => {
    const damage = new Database.SqliteError("database disk image is malformed", "SQLITE_CORRUPT");
    const failing = deps(true, {
      signInLookup: async () => {
        throw damage;
      },
    });

    await answerRendererRequest(failing.deps, {
      type: "sign-in-lookup",
      request_id: "r17",
      email: "ada@example.com",
    });

    expect(failing.failures.map((failure) => failure.error)).toEqual([damage]);
  });

  it("answers that the lookup is unavailable when the register has no database", async () => {
    const withoutDatabase = deps(true, { signInLookup: undefined });

    expect(
      await answerRendererRequest(withoutDatabase.deps, {
        type: "sign-in-lookup",
        request_id: "r18",
        email: "ada@example.com",
      }),
    ).toEqual({
      type: "sign-in-lookup-result",
      request_id: "r18",
      outcome: { kind: "unavailable" },
    });
  });

  it("asks for a first PIN code for the person and answers the outcome", async () => {
    const { deps: withRequest, codeRequests } = deps(true);

    const answer = await answerRendererRequest(withRequest, {
      type: "first-pin-code-request",
      request_id: "r19",
      user_id: "u1",
    });

    expect(codeRequests).toEqual(["u1"]);
    expect(answer).toEqual({
      type: "first-pin-code-request-result",
      request_id: "r19",
      outcome: { kind: "sent" },
    });
  });

  it("answers that the code is unavailable when asking fails, and reports the failure", async () => {
    const failing = deps(true, {
      requestFirstPinCode: async () => {
        throw new Error("boom");
      },
    });

    expect(
      await answerRendererRequest(failing.deps, {
        type: "first-pin-code-request",
        request_id: "r20",
        user_id: "u1",
      }),
    ).toEqual({
      type: "first-pin-code-request-result",
      request_id: "r20",
      outcome: { kind: "unavailable" },
    });
    expect(failing.failures).toHaveLength(1);
  });

  it("answers that the code is unavailable when the register cannot ask for one", async () => {
    const withoutRequest = deps(true, { requestFirstPinCode: undefined });

    expect(
      await answerRendererRequest(withoutRequest.deps, {
        type: "first-pin-code-request",
        request_id: "r21",
        user_id: "u1",
      }),
    ).toEqual({
      type: "first-pin-code-request-result",
      request_id: "r21",
      outcome: { kind: "unavailable" },
    });
  });
  describe("changing the sale in progress", () => {
    const requests = [
      [
        "change-line-quantity",
        { type: "change-line-quantity", line_id: "l1", quantity: 2, expected_quantity: 3 } as const,
        "changeLineQuantity",
        "changing a line's quantity",
        "change l1 2 3",
        "change-line-quantity-result",
      ],
      [
        "remove-sale-line",
        { type: "remove-sale-line", line_id: "l1" } as const,
        "removeSaleLine",
        "removing a sale line",
        "remove l1",
        "remove-sale-line-result",
      ],
      [
        "cancel-sale",
        { type: "cancel-sale" } as const,
        "cancelSale",
        "cancelling the sale",
        "cancel",
        "cancel-sale-result",
      ],
    ] as const;

    it.each(requests)(
      "asks the register to handle %s and answers its outcome",
      async (_type, request, key, _context, recorded, resultType) => {
        const outcome = { kind: "not_signed_in" } as const;
        const recording = deps(true);
        const answering = deps(true, { [key]: async () => outcome });

        expect(
          await answerRendererRequest(answering.deps, { ...request, request_id: "r50" }),
        ).toEqual({
          type: resultType,
          request_id: "r50",
          outcome,
        });
        await answerRendererRequest(recording.deps, { ...request, request_id: "r51" });
        expect(recording.saleChanges).toEqual([recorded]);
      },
    );

    it.each(requests)(
      "answers that %s is unavailable when it fails, and reports why",
      async (_type, request, key, context, _recorded, resultType) => {
        const error = new Error("database is locked");
        const failing = deps(true, {
          [key]: async () => {
            throw error;
          },
        });

        expect(
          await answerRendererRequest(failing.deps, { ...request, request_id: "r52" }),
        ).toEqual({
          type: resultType,
          request_id: "r52",
          outcome: { kind: "unavailable" },
        });
        expect(failing.failures).toEqual([{ context, error }]);
      },
    );

    it.each(requests)(
      "answers that %s is unavailable when the register has no database",
      async (_type, request, key, _context, _recorded, resultType) => {
        const withoutDatabase = deps(true, { [key]: undefined });

        expect(
          await answerRendererRequest(withoutDatabase.deps, { ...request, request_id: "r53" }),
        ).toEqual({ type: resultType, request_id: "r53", outcome: { kind: "unavailable" } });
      },
    );
  });
});
