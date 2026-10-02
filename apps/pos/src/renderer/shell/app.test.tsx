import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  EnrollmentOutcome,
  ListedCashMovement,
  OpenCashSession,
  OpenCashSessionOutcome,
  OpenSale,
  PinCodeRedemptionOutcome,
  ScanProductOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations, switchBrowserLanguage } from "@purosur/ui/test";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreClient } from "../platform/core-client";
import { App } from "./app";

const SIGN_IN_TITLE = "¿Quién abre la caja?";
const SIGNED_IN_TITLE = "¿Qué querés hacer?";
const LOCKED_TITLE = "Caja bloqueada";
const BRAND_LOGO_ALT = "Puro Sur";
const CORE_DOWN_TITLE = "Esperá un momento";
const ENROLLMENT_TITLE = "Dar de alta esta caja";

const SESSION_TITLE = "Venta en curso";
const OPENED: OpenCashSessionOutcome = {
  kind: "opened",
  cash_session: {
    id: "s1",
    opened_at: "2026-09-30T09:02:00.000-03:00",
    opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
    locked: false,
  },
};
const GRACE_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-09-30T09:02:00.000-03:00",
  opened_by: { user_id: "u2", first_name: "Grace", abilities: ["open_cash_session"] },
  locked: false,
};
const GRACE_SESSION_LOCKED: OpenCashSession = { ...GRACE_SESSION, locked: true };
const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 3_500_000, direction: "in" },
  change_given: { amount: 930_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 100_000, direction: "in" },
  expenses: { amount: 50_000, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 4_620_000,
};
const ADA_SELLS: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  cash_session: null,
};

const GRACE_SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u2", first_name: "Grace", abilities: ["open_cash_session"] },
  cash_session: GRACE_SESSION,
};

const ADA_SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  cash_session: null,
};

async function resumeLockedRegister(screen: Awaited<ReturnType<typeof render>>) {
  await userEvent.type(screen.getByLabelText("PIN"), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Retomar" }));
}

function coreAnswering(
  enrolled: boolean,
  outcome: EnrollmentOutcome = { kind: "enrolled" },
  signInOutcome: SignInOutcome = ADA_SIGNED_IN,
  cashDrawer: {
    cashSession?: CoreClient["cashSession"];
    openOutcome?: OpenCashSessionOutcome;
    closeCashSession?: CoreClient["closeCashSession"];
    closeLockedCashSession?: CoreClient["closeLockedCashSession"];
    cancelLockedSale?: CoreClient["cancelLockedSale"];
    identifyLockedCloser?: CoreClient["identifyLockedCloser"];
    authorizers?: CoreClient["authorizers"];
    lockedClosers?: CoreClient["lockedClosers"];
    cashBalance?: CoreClient["cashBalance"];
    sessionOpenSale?: CoreClient["sessionOpenSale"];
    redeemOutcome?: PinCodeRedemptionOutcome;
    cashMovements?: CoreClient["cashMovements"];
    cashMovementKinds?: CoreClient["cashMovementKinds"];
    recordCashMovement?: CoreClient["recordCashMovement"];
  } = {},
  sales: {
    currentSale?: () => Promise<OpenSale | null>;
    scanProduct?: (code: string) => Promise<ScanProductOutcome>;
    cashCharge?: CoreClient["cashCharge"];
    chargeSaleInCash?: CoreClient["chargeSaleInCash"];
    chargeSaleByTransfer?: CoreClient["chargeSaleByTransfer"];
    searchProducts?: CoreClient["searchProducts"];
    addProduct?: CoreClient["addProduct"];
  } = {},
  signOut: () => Promise<void> = async () => {},
) {
  const cashSessionAsks: string[] = [];
  const opened: number[] = [];
  const closed: [string, number][] = [];
  const closedLocked: [string, number, Authorization][] = [];
  const cancelledLocked: Authorization[] = [];
  const recorded: Parameters<CoreClient["recordCashMovement"]>[0][] = [];
  const asked: string[] = [];
  let openedByRegister: OpenCashSession | null = null;
  let usersLoads = 0;
  let savedName: string | null = null;
  const pulledListeners = new Set<() => void>();
  const core: CoreClient = {
    connect() {},
    async enrollmentStatus() {
      asked.push("enrollment-status");
      return enrolled;
    },
    async registerName() {
      return savedName;
    },
    async enroll() {
      return outcome;
    },
    async pinPolicy() {
      return { min_digits: 6 };
    },
    async checkEnrollmentCode() {
      return [];
    },
    async checkPinCodeRedemption() {
      return [];
    },
    async redeemPinCode() {
      return cashDrawer.redeemOutcome ?? { kind: "redeemed" };
    },
    async signInUsers() {
      usersLoads += 1;
      return [{ id: "u1", first_name: "Ada" }];
    },
    async lockedClosers() {
      return cashDrawer.lockedClosers === undefined ? [] : cashDrawer.lockedClosers();
    },
    async authorizers(permission) {
      return cashDrawer.authorizers === undefined ? [] : cashDrawer.authorizers(permission);
    },
    async signIn() {
      return signInOutcome;
    },
    async signInLookup() {
      return { kind: "not_found" };
    },
    async requestFirstPinCode() {
      return { kind: "sent" };
    },
    async firstSignIn() {
      return signInOutcome;
    },
    async signOut() {
      asked.push("sign-out");
      await signOut();
    },
    async openCashSession(openingFloat) {
      opened.push(openingFloat);
      const outcome = cashDrawer.openOutcome ?? OPENED;
      if (outcome.kind === "opened") {
        openedByRegister = outcome.cash_session;
      }
      return outcome;
    },
    async cashSession() {
      cashSessionAsks.push("cash-session");
      return cashDrawer.cashSession === undefined ? openedByRegister : cashDrawer.cashSession();
    },
    async recordCashMovement(input) {
      recorded.push(input);
      return cashDrawer.recordCashMovement === undefined
        ? { kind: "no_open_session" }
        : cashDrawer.recordCashMovement(input);
    },
    async cashMovementKinds() {
      return cashDrawer.cashMovementKinds === undefined
        ? "unavailable"
        : cashDrawer.cashMovementKinds();
    },
    async cashMovements() {
      return cashDrawer.cashMovements === undefined ? [] : cashDrawer.cashMovements();
    },
    async currentSale() {
      return sales.currentSale === undefined ? null : sales.currentSale();
    },
    async changeLineQuantity() {
      return { kind: "unavailable" };
    },
    async removeSaleLine() {
      return { kind: "unavailable" };
    },
    async cancelSale() {
      return { kind: "unavailable" };
    },
    async searchProducts(query) {
      return sales.searchProducts === undefined
        ? { kind: "results", products: [], more: false }
        : sales.searchProducts(query);
    },
    async addProduct(productId) {
      return sales.addProduct === undefined
        ? { kind: "product_unavailable" }
        : sales.addProduct(productId);
    },
    async scanProduct(code) {
      return sales.scanProduct === undefined ? { kind: "unknown_code" } : sales.scanProduct(code);
    },
    async cashCharge(saleId, tendered) {
      return sales.cashCharge === undefined
        ? { kind: "invalid_amount" }
        : sales.cashCharge(saleId, tendered);
    },
    async chargeSaleInCash(saleId, tendered) {
      return sales.chargeSaleInCash === undefined
        ? { kind: "unavailable" }
        : sales.chargeSaleInCash(saleId, tendered);
    },
    async chargeSaleByTransfer(saleId) {
      return sales.chargeSaleByTransfer === undefined
        ? { kind: "unavailable" }
        : sales.chargeSaleByTransfer(saleId);
    },
    async closeCashSession(sessionId, countedCash) {
      closed.push([sessionId, countedCash]);
      return cashDrawer.closeCashSession === undefined
        ? { kind: "unavailable" }
        : cashDrawer.closeCashSession(sessionId, countedCash);
    },
    async closeLockedCashSession(sessionId, countedCash, closer) {
      closedLocked.push([sessionId, countedCash, closer]);
      return cashDrawer.closeLockedCashSession === undefined
        ? { kind: "unavailable" }
        : cashDrawer.closeLockedCashSession(sessionId, countedCash, closer);
    },
    async cancelLockedSale(closer) {
      cancelledLocked.push(closer);
      return cashDrawer.cancelLockedSale === undefined
        ? { kind: "unavailable" }
        : cashDrawer.cancelLockedSale(closer);
    },
    async identifyLockedCloser(closer) {
      return cashDrawer.identifyLockedCloser === undefined
        ? { kind: "identified", person: { user_id: closer.user_id, first_name: "Sofía" } }
        : cashDrawer.identifyLockedCloser(closer);
    },
    async sessionOpenSale() {
      return cashDrawer.sessionOpenSale === undefined ? null : cashDrawer.sessionOpenSale();
    },
    async cashBalance() {
      return cashDrawer.cashBalance === undefined ? null : cashDrawer.cashBalance();
    },
    async cashCountPreview() {
      return null;
    },
    onPulled(listener) {
      pulledListeners.add(listener);
      return () => {
        pulledListeners.delete(listener);
      };
    },
  };
  function finishPull(nameSaved: string | null) {
    savedName = nameSaved;
    for (const listener of pulledListeners) {
      listener();
    }
  }
  return {
    core,
    asked,
    cashSessionAsks,
    opened,
    closed,
    closedLocked,
    cancelledLocked,
    recorded,
    finishPull,
    usersLoads: () => usersLoads,
  };
}

const enrolledCore = coreAnswering(true).core;

function postCoreStatus(status: "starting" | "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

beforeEach(() => page.viewport(1280, 720));

afterEach(async () => {
  vi.useRealTimers();
  await page.viewport(414, 896);
});

describe("App", () => {
  it("shows only the brand panel before the core reports it is ready", async () => {
    const screen = await render(<App core={enrolledCore} />);

    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });

  it("leaves the register for the brand panel when a core that was up starts again", async () => {
    const screen = await render(<App core={enrolledCore} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    postCoreStatus("starting");

    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });

  it("shows who can sign in once the core reports it is up", async () => {
    const screen = await render(<App core={enrolledCore} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register in the sign-in screen's eyebrow once a pull saves its name", async () => {
    const { core, finishPull } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByText("Sin sesión abierta", { exact: true })).toBeVisible();

    finishPull("Caja 1");

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
  });

  it("keeps the chosen person and the typed PIN when a pull refreshes the sign-in screen", async () => {
    const { core, finishPull, usersLoads } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "12");

    finishPull("Caja 1");

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("12");
    await expect.poll(usersLoads).toBe(2);
  });

  it("replaces the whole screen with the core-down notice once the core reports it is down", async () => {
    const screen = await render(<App core={enrolledCore} />);

    postCoreStatus("down");

    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("shows the notice when the core went down before the page started listening", async () => {
    const replyToStatusRequestWithDown = (event: MessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        event.data.channel === "core-status-request"
      ) {
        postCoreStatus("down");
      }
    };
    window.addEventListener("message", replyToStatusRequestWithDown);

    try {
      const screen = await render(<App core={enrolledCore} />);

      await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    } finally {
      window.removeEventListener("message", replyToStatusRequestWithDown);
    }
  });

  it("shows the register again once the core reports it is back up", async () => {
    const screen = await render(<App core={enrolledCore} />);

    postCoreStatus("down");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
  });

  it("shows the enrollment screen once the core is up when this installation isn't enrolled", async () => {
    const screen = await render(<App core={coreAnswering(false).core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: ENROLLMENT_TITLE })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("goes on to who opens the register once the installation is enrolled", async () => {
    const screen = await render(<App core={coreAnswering(false).core} />);
    postCoreStatus("up");

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Código de alta" }),
      "P4NX7KWE2QRT6MZD",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  it("opens the register for the person who signs in", async () => {
    const screen = await render(<App core={enrolledCore} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("takes the cash session the core answers with the sign-in, without reading it again", async () => {
    const { core, cashSessionAsks } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    expect(cashSessionAsks).toHaveLength(1);
  });

  it("resumes the open cash session the core answers with the sign-in even when reading it again would fail", async () => {
    let answers = 0;
    const { core } = coreAnswering(true, { kind: "enrolled" }, GRACE_SIGNED_IN, {
      cashSession: async () => {
        answers += 1;
        if (answers === 1) {
          return GRACE_SESSION_LOCKED;
        }
        throw new Error("the core connection was replaced");
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();

    await resumeLockedRegister(screen);

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
  });

  it("lets the signed-in person in when the core answers the register is not locked, whoever opened it", async () => {
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { ...ADA_SIGNED_IN, cash_session: GRACE_SESSION },
      { cashSession: async () => GRACE_SESSION_LOCKED },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();

    await resumeLockedRegister(screen);

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
  });

  it("keeps the register locked while the core answers the sign-in with the register still locked", async () => {
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { ...ADA_SIGNED_IN, cash_session: GRACE_SESSION_LOCKED },
      { cashSession: async () => GRACE_SESSION_LOCKED },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();

    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Retomar" }));

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
  });

  it("opens the register for a person who signs in for the first time with their email", async () => {
    const core: CoreClient = {
      ...enrolledCore,
      async signInLookup() {
        return { kind: "has_pin", user: { id: "u1", first_name: "Ada" } };
      },
    };
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("link", { name: "Ingresar por primera vez" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Ingresá tu PIN" }))
      .not.toBeInTheDocument();
  });

  it("returns to the sign-in screen once the person confirms leaving the register", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const screen = await render(<App core={enrolledCore} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it.each([
    [
      "the core cannot be asked",
      () => Promise.reject(new Error("the core connection was replaced")),
    ],
    ["the core never answers", () => new Promise<void>(() => {})],
  ])("asks the core to sign out and still leaves when %s", async (_case, signOut) => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const { core, asked } = coreAnswering(
      true,
      { kind: "enrolled" },
      ADA_SIGNED_IN,
      {},
      {},
      signOut,
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    expect(asked).toContain("sign-out");
  });

  it("asks the core to sign out when the person confirms leaving the register", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const { core, asked } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(asked).not.toContain("sign-out");

    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(asked.filter((question) => question === "sign-out")).toHaveLength(1);
  });

  it.each(["down", "starting"] as const)(
    "asks who opens the register again once the core is back up after reporting it is %s",
    async (status) => {
      const screen = await render(<App core={enrolledCore} />);
      postCoreStatus("up");
      await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
      await userEvent.type(screen.getByLabelText("PIN"), "1234");
      await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();

      postCoreStatus(status);
      await expect
        .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
        .not.toBeInTheDocument();
      postCoreStatus("up");

      await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
        .not.toBeInTheDocument();
    },
  );

  it("stays signed in when the person cancels leaving the register", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const screen = await render(<App core={enrolledCore} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("stays on the sign-in screen when the PIN is wrong", async () => {
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("stays on the sign-in screen for a person with no register permission", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, { kind: "no_register_permission" });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("shows the register locked in the opener's name when the core refuses a sign-in for another person", async () => {
    let answers = 0;
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { kind: "cash_session_opened_by_another" },
      {
        cashSession: async () => {
          answers += 1;
          return answers === 1 ? null : GRACE_SESSION_LOCKED;
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Grace" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).not.toBeInTheDocument();
  });

  it("still says the cash session is open when the core cannot tell which one after refusing a sign-in", async () => {
    let answers = 0;
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { kind: "cash_session_opened_by_another" },
      {
        cashSession: async () => {
          answers += 1;
          if (answers === 1) {
            return null;
          }
          throw new Error("the core connection was replaced");
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByText("La caja está abierta")).toBeVisible();
  });

  it("stays on the enrollment screen when the code doesn't work", async () => {
    const screen = await render(
      <App core={coreAnswering(false, { kind: "code_rejected" }).core} />,
    );
    postCoreStatus("up");

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Código de alta" }),
      "P4NX7KWE2QRT6MZD",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    await expect.element(screen.getByText("El código ya no sirve")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: ENROLLMENT_TITLE })).toBeVisible();
  });

  it("asks the core again whether it is enrolled each time the core comes back up", async () => {
    const { core, asked } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    postCoreStatus("starting");
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    await expect.poll(() => asked.length).toBe(2);
  });

  it("stays on the brand panel until the core says whether a cash session is open", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: () => new Promise(() => {}),
    });
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("does not ask for the cash session while the installation isn't enrolled", async () => {
    const { core, cashSessionAsks } = coreAnswering(false);
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: ENROLLMENT_TITLE })).toBeVisible();
    expect(cashSessionAsks).toEqual([]);
  });

  it("shows an open cash session locked in its opener's name, offering no other sign-in", async () => {
    await page.viewport(1280, 720);
    onTestFinished(() => page.viewport(414, 896));
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Grace" })).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Ada")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("resumes the open cash session with the opener's PIN", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, GRACE_SIGNED_IN, {
      cashSession: async () => GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();

    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Retomar" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
  });

  describe("redeeming a PIN code on a locked register", () => {
    async function redeemFromLocked(
      redeemOutcome: PinCodeRedemptionOutcome,
      cashSession: CoreClient["cashSession"] = async () => GRACE_SESSION,
    ) {
      const { core } = coreAnswering(true, { kind: "enrolled" }, GRACE_SIGNED_IN, {
        cashSession,
        redeemOutcome,
      });
      const screen = await render(<App core={core} />);
      postCoreStatus("up");
      await userEvent.click(
        screen.getByRole("link", { name: "Tengo un código para cambiar el PIN" }),
      );
      await userEvent.fill(screen.getByRole("textbox", { name: "Código" }), "K7QM2XPA3DTR4HWN");
      await userEvent.fill(screen.getByLabelText("PIN nuevo, de al menos 6 dígitos"), "482915");
      await userEvent.fill(screen.getByLabelText("Repetí el PIN nuevo"), "482915");
      await userEvent.click(screen.getByRole("button", { name: "Guardar el PIN nuevo" }));
      return screen;
    }

    it("resumes the session when the opener redeemed the code", async () => {
      const screen = await redeemFromLocked({
        kind: "resumed",
        person: { user_id: "u2", first_name: "Grace", abilities: ["open_cash_session"] },
        cash_session: GRACE_SESSION,
      });

      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
      await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
    });

    it("resumes the open cash session the core answers with the redemption even when reading it again would fail", async () => {
      let answers = 0;
      const screen = await redeemFromLocked(
        {
          kind: "resumed",
          person: { user_id: "u2", first_name: "Grace", abilities: ["open_cash_session"] },
          cash_session: GRACE_SESSION,
        },
        async () => {
          answers += 1;
          if (answers === 1) {
            return GRACE_SESSION_LOCKED;
          }
          throw new Error("the core connection was replaced");
        },
      );

      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    });

    it("stays locked and says only the opener can use a code when someone else redeemed it", async () => {
      const screen = await redeemFromLocked({ kind: "cash_session_opened_by_another" });

      await expect.element(screen.getByText("La caja está abierta")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: SESSION_TITLE }))
        .not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Volver" }));
      await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
    });
  });

  it("shows the sale in progress", async () => {
    const reads: string[] = [];
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => GRACE_SESSION },
      {
        currentSale: async () => {
          reads.push("read");
          return {
            id: "sale-1",
            lines: [
              {
                id: "line-1",
                product_id: "p1",
                product_name: "Yerba mate 1 kg",
                quantity: 1,
                list_unit_price: 238_000,
                discount_amount: 0,
                promotion: null,
                line_total: 238_000,
              },
            ],
            total: 238_000,
            charge_refusal: null,
          };
        },
      },
    );
    const screen = await render(<App core={core} />);

    postCoreStatus("up");
    await resumeLockedRegister(screen);

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(reads).toEqual(["read"]);
  });

  it("charges the sale in progress in cash through the core", async () => {
    const charges: [string, number][] = [];
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => GRACE_SESSION },
      {
        currentSale: async () => ({
          id: "sale-1",
          lines: [
            {
              id: "line-1",
              product_id: "p1",
              product_name: "Yerba mate 1 kg",
              quantity: 1,
              list_unit_price: 238_000,
              discount_amount: 0,
              promotion: null,
              line_total: 238_000,
            },
          ],
          total: 238_000,
          charge_refusal: null,
        }),
        cashCharge: async () => ({ kind: "covered", applied: 238_000, change: 12_000 }),
        chargeSaleInCash: async (saleId, tendered) => {
          charges.push([saleId, tendered]);
          return { kind: "completed", sale_id: saleId, total: 238_000, tendered, change: 12_000 };
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);

    await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await userEvent.click(screen.getByText("Efectivo", { exact: true }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "2.500,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));

    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    expect(charges).toEqual([["sale-1", 250_000]]);
  });

  it("shows no line of the sale that was just charged when a new sale starts", async () => {
    const yerba = {
      id: "line-1",
      product_id: "p1",
      product_name: "Yerba mate 1 kg",
      quantity: 1,
      list_unit_price: 238_000,
      discount_amount: 0,
      promotion: null,
      line_total: 238_000,
    };
    let reads = 0;
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => GRACE_SESSION },
      {
        currentSale: () => {
          reads += 1;
          return reads <= 2
            ? Promise.resolve({
                id: "sale-1",
                lines: [yerba],
                total: 238_000,
                charge_refusal: null,
              })
            : new Promise(() => {});
        },
        cashCharge: async () => ({ kind: "covered", applied: 238_000, change: 12_000 }),
        chargeSaleInCash: async (saleId, tendered) => ({
          kind: "completed",
          sale_id: saleId,
          total: 238_000,
          tendered,
          change: 12_000,
        }),
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);
    await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await userEvent.click(screen.getByText("Efectivo", { exact: true }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
      "2.500,00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));
    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.poll(() => reads).toBe(3);
    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
  });

  it("charges the sale in progress by transfer through the core", async () => {
    const charges: string[] = [];
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => GRACE_SESSION },
      {
        currentSale: async () => ({
          id: "sale-1",
          lines: [
            {
              id: "line-1",
              product_id: "p1",
              product_name: "Yerba mate 1 kg",
              quantity: 1,
              list_unit_price: 238_000,
              discount_amount: 0,
              promotion: null,
              line_total: 238_000,
            },
          ],
          total: 238_000,
          charge_refusal: null,
        }),
        chargeSaleByTransfer: async (saleId) => {
          charges.push(saleId);
          return { kind: "completed", sale_id: saleId, total: 238_000 };
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);

    await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await userEvent.click(screen.getByText("Transferencia", { exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));

    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    expect(charges).toEqual(["sale-1"]);
  });

  it("shows no line of the sale that was just charged by transfer when a new sale starts", async () => {
    const yerba = {
      id: "line-1",
      product_id: "p1",
      product_name: "Yerba mate 1 kg",
      quantity: 1,
      list_unit_price: 238_000,
      discount_amount: 0,
      promotion: null,
      line_total: 238_000,
    };
    let reads = 0;
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => GRACE_SESSION },
      {
        currentSale: () => {
          reads += 1;
          return reads <= 2
            ? Promise.resolve({
                id: "sale-1",
                lines: [yerba],
                total: 238_000,
                charge_refusal: null,
              })
            : new Promise(() => {});
        },
        chargeSaleByTransfer: async (saleId) => ({
          kind: "completed",
          sale_id: saleId,
          total: 238_000,
        }),
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);
    await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    await userEvent.click(screen.getByText("Transferencia", { exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Vi el ingreso" }));
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.poll(() => reads).toBe(3);
    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
  });

  it("goes back to the no-session screen, still signed in, when a scan finds that the cash session is no longer open", async () => {
    const sessions: (OpenCashSession | null)[] = [GRACE_SESSION, null];
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => sessions.shift() ?? null },
      { scanProduct: async () => ({ kind: "no_open_session" }) },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);
    const field = screen.getByRole("combobox", { name: "Producto" });
    await field.fill("7790001");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
  });

  it("searches the core by name and goes back to the no-session screen, still signed in, when adding the chosen product finds that the cash session is no longer open", async () => {
    const sessions: (OpenCashSession | null)[] = [GRACE_SESSION, null];
    const searched: string[] = [];
    const added: string[] = [];
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      GRACE_SIGNED_IN,
      { cashSession: async () => sessions.shift() ?? null },
      {
        searchProducts: async (query) => {
          searched.push(query);
          return {
            kind: "results",
            products: [
              {
                product_id: "p1",
                name: "Yerba mate 1 kg",
                sale_unit: "UNIT",
                unit_price: 238_000,
                matches: [],
              },
            ],
            more: false,
          };
        },
        addProduct: async (productId) => {
          added.push(productId);
          return { kind: "no_open_session" };
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await resumeLockedRegister(screen);
    await screen.getByRole("combobox", { name: "Producto" }).fill("yer");
    await expect.element(screen.getByRole("option")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    expect(searched).toEqual(["yer"]);
    expect(added).toEqual(["p1"]);
  });

  it("asks the core for the cash session again each time it comes back up, and waits for the answer", async () => {
    let answers: (() => Promise<OpenCashSession | null>)[] = [
      async () => null,
      () => new Promise(() => {}),
    ];
    const { core, cashSessionAsks } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: () => {
        const [answer, ...rest] = answers;
        answers = rest;
        return answer?.() ?? Promise.resolve(GRACE_SESSION);
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    postCoreStatus("starting");
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    postCoreStatus("up");

    await expect.poll(() => cashSessionAsks.length).toBe(2);
    await expect.element(screen.getByRole("img", { name: BRAND_LOGO_ALT })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("shows that the core is down, not the sign-in, when the core cannot read the cash session", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => "unavailable",
    });
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("asks for the cash session again when the core comes back up after it could not read it", async () => {
    let readable = false;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => (readable ? null : "unavailable"),
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    readable = true;
    postCoreStatus("starting");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).not.toBeInTheDocument();
    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  it("keeps asking for the cash session while the core stays up, until it can read it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers: ("unavailable" | null)[] = ["unavailable", "unavailable", null];
    const { core, cashSessionAsks } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => answers.shift() ?? null,
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    await vi.advanceTimersToNextTimerAsync();
    await expect.poll(() => cashSessionAsks.length).toBe(2);
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();
    await expect
      .poll(async () => {
        await vi.advanceTimersToNextTimerAsync();
        return cashSessionAsks.length;
      })
      .toBe(3);

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  it("shows the open cash session locked once a failed read of it succeeds while the core stays up", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers: (OpenCashSession | "unavailable")[] = ["unavailable", GRACE_SESSION];
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => answers.shift() ?? GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    await vi.advanceTimersToNextTimerAsync();

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
  });

  it("does not ask for the cash session again while it could read it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { core, cashSessionAsks } = coreAnswering(true);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(cashSessionAsks).toHaveLength(1);
  });

  it("shows a cash session that was opened while the core was down", async () => {
    let open = false;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => (open ? GRACE_SESSION : null),
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();

    open = true;
    postCoreStatus("starting");
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("opens the cash session for the person who signed in and lands on the open-session screen", async () => {
    const { core, opened } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS);
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
    expect(opened).toEqual([10_000]);
  });

  it("lands on the open-session screen with the session the core answers once opened, even when reading it again says the core cannot", async () => {
    let answers = 0;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      cashSession: async () => {
        answers += 1;
        return answers === 1 ? null : "unavailable";
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
  });

  it("shows the register locked in the opener's name when the core says a session of another person is already open", async () => {
    let answers = 0;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "already_open" },
      cashSession: async () => {
        answers += 1;
        return answers === 1 ? null : GRACE_SESSION_LOCKED;
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Grace" })).toBeVisible();
  });

  it("signs the person out in the core when the session already open is another person's", async () => {
    let answers = 0;
    const { core, asked } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "already_open" },
      cashSession: async () => {
        answers += 1;
        return answers === 1 ? null : GRACE_SESSION_LOCKED;
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));
    await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();

    expect(asked).toContain("sign-out");
  });

  it("asks to try again when the core cannot tell which session is already open", async () => {
    let answers = 0;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "already_open" },
      cashSession: async () => {
        answers += 1;
        if (answers === 1) {
          return null;
        }
        throw new Error("the core connection was replaced");
      },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect
      .element(screen.getByText("No se pudo abrir la caja. Probá de nuevo.").first())
      .toBeVisible();
  });

  it("stays on the no-session screen when the core refuses to open the cash session", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "not_permitted" },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect
      .element(screen.getByText("No tenés permiso para abrir la caja.").first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SESSION_TITLE }))
      .not.toBeInTheDocument();
  });

  it("goes back to sign-in when the core says nobody is signed in to open the cash session", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "not_signed_in" },
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
    await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
  });

  describe("closing the cash session", () => {
    async function resumeGracesSession(
      cashDrawer: {
        closeCashSession?: CoreClient["closeCashSession"];
        cashSession?: CoreClient["cashSession"];
        cashBalance?: CoreClient["cashBalance"];
        cashMovements?: CoreClient["cashMovements"];
        openOutcome?: OpenCashSessionOutcome;
      } = {},
      sales: { scanProduct?: CoreClient["scanProduct"] } = {},
    ) {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      const fake = coreAnswering(
        true,
        { kind: "enrolled" },
        GRACE_SIGNED_IN,
        {
          cashSession: async () => GRACE_SESSION,
          cashBalance: async () => BALANCE,
          ...cashDrawer,
        },
        sales,
      );
      const screen = await render(<App core={fake.core} />);
      postCoreStatus("up");
      await userEvent.type(screen.getByLabelText("PIN"), "1234");
      await userEvent.click(screen.getByRole("button", { name: "Retomar" }));
      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
      return { screen, ...fake };
    }

    async function startClosing(screen: Awaited<ReturnType<typeof render>>) {
      await userEvent.click(screen.getByRole("link", { name: "Caja" }));
      await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
      await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
    }

    it("opens the cash screen from the rail and keeps the person there", async () => {
      const { screen } = await resumeGracesSession();

      await userEvent.click(screen.getByRole("link", { name: "Caja" }));

      await expect
        .element(screen.getByRole("heading", { name: "Movimientos de efectivo", exact: true }))
        .toBeVisible();
      await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).toBeVisible();
      await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: SESSION_TITLE }))
        .not.toBeInTheDocument();
    });

    it("reads only what a pull can change when a pull happens while the cash screen is shown", async () => {
      const cashBalance = vi
        .fn<CoreClient["cashBalance"]>()
        .mockResolvedValueOnce(BALANCE)
        .mockResolvedValue({ ...BALANCE, expected: 5_000_000 });
      const cashMovements = vi.fn<CoreClient["cashMovements"]>().mockResolvedValue([]);
      const { screen, finishPull } = await resumeGracesSession({ cashBalance, cashMovements });
      await userEvent.click(screen.getByRole("link", { name: "Caja" }));
      await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();

      finishPull("Caja 1");

      await expect.element(screen.getByText(/Caja 1 · Sesión abierta/)).toBeVisible();
      expect(cashBalance).toHaveBeenCalledTimes(1);
      expect(cashMovements).toHaveBeenCalledTimes(1);
    });

    it("lands on the no-session screen when an older read of the cash session answers after the session is closed", async () => {
      const clients: QueryClient[] = [];
      const mount = QueryClient.prototype.mount;
      const spy = vi.spyOn(QueryClient.prototype, "mount").mockImplementation(function (
        this: QueryClient,
      ) {
        clients.push(this);
        return mount.call(this);
      });
      onTestFinished(() => spy.mockRestore());
      let answerLate: (session: OpenCashSession) => void = () => {};
      let reads = 0;
      const { screen } = await resumeGracesSession(
        {
          cashSession: () => {
            reads += 1;
            return reads === 1
              ? Promise.resolve(GRACE_SESSION)
              : new Promise((resolve) => {
                  answerLate = resolve;
                });
          },
          closeCashSession: async () => ({
            kind: "closed",
            session: {
              id: "s1",
              expected_cash: 4_620_000,
              counted_cash: 4_580_000,
              difference: -40_000,
            },
          }),
        },
        { scanProduct: async () => ({ kind: "no_open_session" }) },
      );
      await screen.getByRole("combobox", { name: "Producto" }).fill("7790001");
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => reads).toBe(2);
      await startClosing(screen);
      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();

      answerLate(GRACE_SESSION);
      await expect.poll(() => clients.every((client) => client.isFetching() === 0)).toBe(true);

      expect(clients[0]?.getQueryData(["register", "cash-session"])).toEqual({ status: "none" });
      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    });

    it("starts the cash screen of a new session from loading, not from the balance of the one before", async () => {
      const cashBalance = vi
        .fn<CoreClient["cashBalance"]>()
        .mockResolvedValueOnce(BALANCE)
        .mockImplementation(() => new Promise(() => {}));
      const { screen } = await resumeGracesSession({
        cashBalance,
        closeCashSession: async () => ({
          kind: "closed",
          session: {
            id: "s1",
            expected_cash: 4_620_000,
            counted_cash: 4_580_000,
            difference: -40_000,
          },
        }),
        openOutcome: {
          kind: "opened",
          cash_session: { ...GRACE_SESSION, id: "s2", opened_at: "2026-09-30T12:00:00.000-03:00" },
        },
      });
      await startClosing(screen);
      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      await userEvent.fill(screen.getByRole("textbox", { name: "Fondo inicial" }), "100");
      await userEvent.click(screen.getByRole("button", { name: "Abrir la caja" }));
      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();

      await userEvent.click(screen.getByRole("link", { name: "Caja" }));

      await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).toBeVisible();
      await expect
        .element(screen.getByText("$ 46.200,00", { exact: true }))
        .not.toBeInTheDocument();
    });

    it("lands on the no-session screen, still signed in, once the session is closed", async () => {
      const closeOutcome: CloseCashSessionOutcome = {
        kind: "closed",
        session: {
          id: "s1",
          expected_cash: 4_620_000,
          counted_cash: 4_580_000,
          difference: -40_000,
        },
      };
      const { screen, closed, asked } = await resumeGracesSession({
        closeCashSession: async () => closeOutcome,
      });
      await startClosing(screen);

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
      await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
      expect(closed).toEqual([["s1", 4_580_000]]);
      expect(asked).not.toContain("sign-out");
    });

    it("leaves the register locked in the opener's name from Salir, resumed with the opener's PIN", async () => {
      const { screen, asked } = await resumeGracesSession();
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));

      await userEvent.click(screen.getByRole("button", { name: "Dejar bloqueada" }));

      await expect.element(screen.getByRole("heading", { name: LOCKED_TITLE })).toBeVisible();
      await expect.element(screen.getByRole("radio", { name: "Grace" })).toBeVisible();
      expect(asked).toContain("sign-out");
      await userEvent.type(screen.getByLabelText("PIN"), "1234");
      await userEvent.click(screen.getByRole("button", { name: "Retomar" }));
      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    });

    it("ends signed out at the entry screen when the close was started from Salir", async () => {
      const { screen, closed, asked } = await resumeGracesSession({
        closeCashSession: async () => ({
          kind: "closed",
          session: {
            id: "s1",
            expected_cash: 4_620_000,
            counted_cash: 4_580_000,
            difference: -40_000,
          },
        }),
      });
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));
      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" })
          .getByRole("button", { name: "Cerrar caja" }),
      );
      await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

      await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: SIGNED_IN_TITLE }))
        .not.toBeInTheDocument();
      expect(closed).toEqual([["s1", 4_580_000]]);
      expect(asked).toContain("sign-out");
    });

    it("stays signed in on the cash count when the close from Salir is refused", async () => {
      const { screen, asked } = await resumeGracesSession({
        closeCashSession: async () => ({ kind: "open_sale", total: 3_434_000, cancellable: true }),
      });
      await userEvent.click(screen.getByRole("button", { name: "Salir" }));
      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" })
          .getByRole("button", { name: "Cerrar caja" }),
      );
      await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

      await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
      expect(asked).not.toContain("sign-out");
    });

    it("stays on the cash count and offers the sale when it is still open", async () => {
      const { screen } = await resumeGracesSession({
        closeCashSession: async () => ({ kind: "open_sale", total: 3_434_000, cancellable: true }),
      });
      await startClosing(screen);

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
      await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Ir a la venta" }));

      await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    });

    it("stays on the cash count when the core says another session is now open", async () => {
      const other: OpenCashSession = { ...GRACE_SESSION, id: "s2" };
      let asks = 0;
      const { screen } = await resumeGracesSession({
        closeCashSession: async () => ({ kind: "no_open_session" }),
        cashSession: async () => {
          asks += 1;
          return asks === 1 ? GRACE_SESSION : other;
        },
      });
      await startClosing(screen);

      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

      await expect.poll(() => asks).toBe(2);
      await expect.element(screen.getByRole("heading", { name: "Cerrar caja" })).toBeVisible();
    });
  });

  describe("closing a locked register's cash session by another person", () => {
    async function identifyFromLocked(
      cashDrawer: {
        identifyLockedCloser?: CoreClient["identifyLockedCloser"];
        closeLockedCashSession?: CoreClient["closeLockedCashSession"];
        cancelLockedSale?: CoreClient["cancelLockedSale"];
        sessionOpenSale?: CoreClient["sessionOpenSale"];
        cashSession?: CoreClient["cashSession"];
      } = {},
    ) {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      const fake = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
        cashSession: async () => GRACE_SESSION,
        cashBalance: async () => BALANCE,
        lockedClosers: async () => [{ id: "u3", first_name: "Sofía" }],
        ...cashDrawer,
      });
      const screen = await render(<App core={fake.core} />);
      postCoreStatus("up");
      await userEvent.click(screen.getByRole("link", { name: "Otra persona cierra la caja" }));
      await userEvent.click(screen.getByText("Sofía", { exact: true }));
      await userEvent.type(screen.getByLabelText("PIN"), "1234");
      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
      return { screen, ...fake };
    }

    async function closeFromLocked(cashDrawer: Parameters<typeof identifyFromLocked>[0]) {
      const identified = await identifyFromLocked(cashDrawer);
      const { screen } = identified;
      await expect
        .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
        .toBeVisible();
      await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
      await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
      return identified;
    }

    it("lists again who may close the register once a pull happens", async () => {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      let closers = [{ id: "u3", first_name: "Sofía" }];
      const { core, finishPull } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
        cashSession: async () => GRACE_SESSION_LOCKED,
        lockedClosers: async () => closers,
      });
      const screen = await render(<App core={core} />);
      postCoreStatus("up");
      await userEvent.click(screen.getByRole("link", { name: "Otra persona cierra la caja" }));
      await expect.element(screen.getByText("Sofía", { exact: true })).toBeVisible();
      closers = [...closers, { id: "u4", first_name: "Tomás" }];

      finishPull(null);

      await expect.element(screen.getByText("Tomás", { exact: true })).toBeVisible();
    });

    it("lands on the sign-in screen with nobody signed in once the session is closed", async () => {
      const { screen, closedLocked, asked } = await closeFromLocked({
        closeLockedCashSession: async () => ({
          kind: "closed",
          session: {
            id: "s1",
            expected_cash: 4_620_000,
            counted_cash: 4_580_000,
            difference: -40_000,
          },
        }),
      });

      await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
      expect(closedLocked).toEqual([["s1", 4_580_000, { user_id: "u3", pin: "1234" }]]);
      expect(asked).not.toContain("sign-out");
    });

    it.each(["no_open_session", "not_locked"] as const)(
      "reads the cash session again when the close answers %s",
      async (kind) => {
        let asks = 0;
        const { screen } = await closeFromLocked({
          closeLockedCashSession: async () => ({ kind }),
          cashSession: async () => {
            asks += 1;
            return asks === 1 ? GRACE_SESSION : null;
          },
        });

        await expect.poll(() => asks).toBe(2);
        await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
      },
    );

    describe("cancelling its open sale", () => {
      async function cancelFromLocked(cashDrawer: Parameters<typeof identifyFromLocked>[0]) {
        const identified = await identifyFromLocked({
          sessionOpenSale: async () => ({ total: 3_434_000, cancellable: true }),
          ...cashDrawer,
        });
        await userEvent.click(identified.screen.getByRole("button", { name: "Cancelar la venta" }));
        await userEvent.click(
          identified.screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }),
        );
        return identified;
      }

      it("cancels it with the PIN of the person who closes, staying on the cash count", async () => {
        const { screen, cancelledLocked } = await cancelFromLocked({
          cancelLockedSale: async () => ({ kind: "cancelled" }),
        });

        await expect.poll(() => cancelledLocked).toEqual([{ user_id: "u3", pin: "1234" }]);
        await expect
          .element(screen.getByText("Hay una venta abierta de $ 34.340,00"))
          .not.toBeInTheDocument();
        await expect.element(screen.getByRole("heading", { name: "Cerrar caja" })).toBeVisible();
      });

      it.each(["no_open_session", "not_locked"] as const)(
        "reads the cash session again when the cancellation answers %s",
        async (kind) => {
          let asks = 0;
          const { screen } = await cancelFromLocked({
            cancelLockedSale: async () => ({ kind }),
            cashSession: async () => {
              asks += 1;
              return asks === 1 ? GRACE_SESSION : null;
            },
          });

          await expect.poll(() => asks).toBe(2);
          await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
        },
      );
    });

    it("reads the cash session again when identifying answers that the register is not locked", async () => {
      let asks = 0;
      const { screen } = await identifyFromLocked({
        identifyLockedCloser: async () => ({ kind: "not_locked" }),
        cashSession: async () => {
          asks += 1;
          return asks === 1 ? GRACE_SESSION : null;
        },
      });

      await expect.poll(() => asks).toBe(2);
      await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    });

    it("stays on the locked register's close when reading the cash session again finds it still locked", async () => {
      let asks = 0;
      const { screen } = await identifyFromLocked({
        identifyLockedCloser: async () => ({ kind: "not_locked" }),
        cashSession: async () => {
          asks += 1;
          return asks === 1 ? GRACE_SESSION : GRACE_SESSION_LOCKED;
        },
      });

      await expect.poll(() => asks).toBe(2);
      await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
        .toBeVisible();
    });
  });

  describe("recording cash movements", () => {
    const MOVER_SESSION: OpenCashSession = {
      ...GRACE_SESSION,
      opened_by: { ...GRACE_SESSION.opened_by, abilities: [] },
    };
    const OPENING: ListedCashMovement = {
      id: "m1",
      type: "OPENING",
      amount: 2_000_000,
      reason: null,
      direction: "in",
      occurred_at: GRACE_SESSION.opened_at,
      actor: { user_id: "u2", first_name: "Grace" },
      authorized_by: null,
    };

    async function openCashScreen(
      cashDrawer: {
        cashSession?: CoreClient["cashSession"];
        cashBalance?: CoreClient["cashBalance"];
        cashMovements?: CoreClient["cashMovements"];
        cashMovementKinds?: CoreClient["cashMovementKinds"];
        recordCashMovement?: CoreClient["recordCashMovement"];
        authorizers?: CoreClient["authorizers"];
      } = {},
    ) {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      const fake = coreAnswering(
        true,
        { kind: "enrolled" },
        {
          kind: "signed_in",
          person: { user_id: "u2", first_name: "Grace", abilities: [] },
          cash_session: MOVER_SESSION,
        },
        {
          cashSession: async () => MOVER_SESSION,
          cashBalance: async () => BALANCE,
          cashMovements: async () => [OPENING],
          cashMovementKinds: async () => ({
            CASH_IN: { permission: "record_cash_in", authorization_required: false },
            CASH_OUT: { permission: "record_cash_expense", authorization_required: true },
            WITHDRAWAL: { permission: "withdraw_cash", authorization_required: true },
          }),
          ...cashDrawer,
        },
      );
      const screen = await render(<App core={fake.core} />);
      postCoreStatus("up");
      await resumeLockedRegister(screen);
      await userEvent.click(screen.getByRole("link", { name: "Caja" }));
      await expect
        .element(
          screen
            .getByRole("table", { name: "Movimientos de la sesión" })
            .getByText("Apertura de sesión", { exact: true }),
        )
        .toBeVisible();
      return { screen, ...fake };
    }

    async function recordCashIn(screen: Awaited<ReturnType<typeof render>>) {
      await userEvent.click(
        screen.getByRole("button", { name: "Registrar movimiento", exact: true }),
      );
      await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "500");
      await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), "Cambio");
      await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    }

    it("lists the movements the core has for the session", async () => {
      const { screen } = await openCashScreen();

      await expect.element(screen.getByText("1 movimiento", { exact: true })).toBeVisible();
    });

    it("records a movement through the core and reads the balance and the movements again", async () => {
      const cashBalance = vi
        .fn<CoreClient["cashBalance"]>()
        .mockResolvedValueOnce(BALANCE)
        .mockResolvedValueOnce({
          ...BALANCE,
          cash_in: { amount: 600_000, direction: "in" },
          expected: 5_120_000,
        });
      const cashMovements = vi
        .fn<CoreClient["cashMovements"]>()
        .mockResolvedValueOnce([OPENING])
        .mockResolvedValueOnce([
          OPENING,
          { ...OPENING, id: "m2", type: "CASH_IN", reason: "Cambio", amount: 50_000 },
        ]);
      const { screen, recorded } = await openCashScreen({
        cashBalance,
        cashMovements,
        recordCashMovement: async () => ({ kind: "recorded", authorized_by: null }),
      });

      await recordCashIn(screen);

      await expect.element(screen.getByText("2 movimientos", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("$ 51.200,00", { exact: true })).toBeVisible();
      expect(recorded).toEqual([{ kind: "CASH_IN", amount: 50_000, reason: "Cambio" }]);
    });

    it("announces the design system's screen-reader texts in Spanish whatever the operating system's language", async () => {
      const { screen } = await openCashScreen({
        authorizers: async () => [{ id: "u3", first_name: "Sofía" }],
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Registrar movimiento", exact: true }),
      );
      await userEvent.click(
        screen.getByRole("radiogroup", { name: "Tipo de movimiento" }).getByText("Gasto"),
      );

      switchBrowserLanguage("de-DE");
      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));

      await expect
        .element(screen.getByRole("button", { name: "Descartar" }).first())
        .toBeInTheDocument();
    });

    it("leaves the cash screen when the core says there is no open session", async () => {
      let asks = 0;
      const { screen } = await openCashScreen({
        cashSession: async () => {
          asks += 1;
          return asks === 1 ? MOVER_SESSION : null;
        },
        recordCashMovement: async () => ({ kind: "no_open_session" }),
      });

      await recordCashIn(screen);

      await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    });
  });
});
