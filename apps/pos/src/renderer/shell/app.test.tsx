import type {
  Authorization,
  CashBalance,
  CloseCashSessionOutcome,
  EnrollmentOutcome,
  ListedCashMovement,
  OpenCashSession,
  OpenCashSessionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreClient } from "../platform/core-client";
import { App } from "./app";

const SIGN_IN_TITLE = "¿Quién abre la caja?";
const SIGNED_IN_TITLE = "¿Qué querés hacer?";
const BRAND_LOGO_ALT = "Puro Sur";
const CORE_DOWN_TITLE = "Esperá un momento";
const ENROLLMENT_TITLE = "Dar de alta esta caja";

const SESSION_TITLE = "Venta en curso";
const OPENED: OpenCashSessionOutcome = {
  kind: "opened",
  session: { id: "s1", opened_at: "2026-09-30T12:02:00.000Z", opening_float: 10_000 },
};
const GRACE_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-09-30T12:02:00.000Z",
  opened_by: { user_id: "u2", first_name: "Grace", permission_keys: ["sell_and_charge"] },
};
const BALANCE: CashBalance = {
  opening_float: 2_000_000,
  cash_sales: 3_500_000,
  change_given: 930_000,
  refunds: 0,
  cash_in: 100_000,
  expenses: 50_000,
  withdrawals: 0,
  expected: 4_620_000,
};
const ADA_SELLS: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
};

const ADA_SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
};

function coreAnswering(
  enrolled: boolean,
  outcome: EnrollmentOutcome = { kind: "enrolled" },
  signInOutcome: SignInOutcome = ADA_SIGNED_IN,
  cashDrawer: {
    cashSession?: CoreClient["cashSession"];
    openOutcome?: OpenCashSessionOutcome;
    closeCashSession?: CoreClient["closeCashSession"];
    cashBalance?: CoreClient["cashBalance"];
    cashMovements?: CoreClient["cashMovements"];
    recordCashMovement?: CoreClient["recordCashMovement"];
  } = {},
  signOut: () => Promise<void> = async () => {},
) {
  const cashSessionAsks: string[] = [];
  const opened: number[] = [];
  const closed: [string, number, Authorization | undefined][] = [];
  const recorded: Parameters<CoreClient["recordCashMovement"]>[0][] = [];
  const asked: string[] = [];
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
    async redeemPinCode() {
      return { kind: "redeemed" };
    },
    async signInUsers() {
      usersLoads += 1;
      return [{ id: "u1", first_name: "Ada" }];
    },
    async authorizers() {
      return [];
    },
    async signIn() {
      return signInOutcome;
    },
    async signInLookup() {
      return { kind: "not_found" };
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
      return cashDrawer.openOutcome ?? OPENED;
    },
    async cashSession() {
      cashSessionAsks.push("cash-session");
      return cashDrawer.cashSession === undefined ? null : cashDrawer.cashSession();
    },
    async recordCashMovement(input) {
      recorded.push(input);
      return cashDrawer.recordCashMovement === undefined
        ? { kind: "no_open_session" }
        : cashDrawer.recordCashMovement(input);
    },
    async cashMovements() {
      return cashDrawer.cashMovements === undefined ? [] : cashDrawer.cashMovements();
    },
    async closeCashSession(sessionId, countedCash, authorization) {
      closed.push([sessionId, countedCash, authorization]);
      return cashDrawer.closeCashSession === undefined
        ? { kind: "unavailable" }
        : cashDrawer.closeCashSession(sessionId, countedCash, authorization);
    },
    async cashBalance() {
      return cashDrawer.cashBalance === undefined ? null : cashDrawer.cashBalance();
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
    recorded,
    finishPull,
    usersLoads: () => usersLoads,
  };
}

const enrolledCore = coreAnswering(true).core;

function postCoreStatus(status: "starting" | "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

afterEach(() => {
  vi.useRealTimers();
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
    expect(usersLoads()).toBe(1);
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
    const { core, asked } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {}, signOut);
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

  it("shows the cash session another person opened when the core refuses a sign-in for it", async () => {
    let answers = 0;
    const { core } = coreAnswering(
      true,
      { kind: "enrolled" },
      { kind: "cash_session_opened_by_another" },
      {
        cashSession: async () => {
          answers += 1;
          return answers === 1 ? null : GRACE_SESSION;
        },
      },
    );
    const screen = await render(<App core={core} />);
    postCoreStatus("up");

    await userEvent.click(screen.getByRole("radio", { name: "Ada" }), { force: true });
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
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

  it("resumes an open cash session for the person who opened it, without asking for a PIN", async () => {
    await page.viewport(1280, 720);
    onTestFinished(() => page.viewport(414, 896));
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
    await expect.element(screen.getByText("Sesión abierta 09:02")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Salir" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("resumes the open cash session even when the person who was in had signed in as someone else", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);

    postCoreStatus("up");

    await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
    await expect.element(screen.getByText("Ada")).not.toBeInTheDocument();
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
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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

  it("resumes the open cash session once a failed read of it succeeds while the core stays up", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answers: (OpenCashSession | "unavailable")[] = ["unavailable", GRACE_SESSION];
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
      cashSession: async () => answers.shift() ?? GRACE_SESSION,
    });
    const screen = await render(<App core={core} />);
    postCoreStatus("up");
    await expect.element(screen.getByText(CORE_DOWN_TITLE)).toBeVisible();

    await vi.advanceTimersToNextTimerAsync();

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
  });

  it("does not ask for the cash session again while it could read it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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

    await expect.element(screen.getByRole("heading", { name: SESSION_TITLE })).toBeVisible();
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
    await expect.element(screen.getByRole("button", { name: "Salir" })).not.toBeInTheDocument();
    expect(opened).toEqual([10_000]);
  });

  it("shows the session that is already open when the core says so", async () => {
    let answers = 0;
    const { core } = coreAnswering(true, { kind: "enrolled" }, ADA_SELLS, {
      openOutcome: { kind: "already_open" },
      cashSession: async () => {
        answers += 1;
        return answers === 1 ? null : GRACE_SESSION;
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
    await expect.element(screen.getByRole("navigation").getByText("Grace")).toBeVisible();
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
      } = {},
    ) {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      const fake = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
        cashSession: async () => GRACE_SESSION,
        cashBalance: async () => BALANCE,
        ...cashDrawer,
      });
      const screen = await render(<App core={fake.core} />);
      postCoreStatus("up");
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
      const { screen, closed } = await resumeGracesSession({
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
      expect(closed).toEqual([["s1", 4_580_000, undefined]]);
    });

    it("stays on the cash count and offers the sale when it is still open", async () => {
      const { screen } = await resumeGracesSession({
        closeCashSession: async () => ({ kind: "open_sale", total: 3_434_000 }),
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

  describe("recording cash movements", () => {
    const MOVER_SESSION: OpenCashSession = {
      ...GRACE_SESSION,
      opened_by: { ...GRACE_SESSION.opened_by, permission_keys: ["record_cash_in"] },
    };
    const OPENING: ListedCashMovement = {
      id: "m1",
      type: "OPENING",
      amount: 2_000_000,
      reason: null,
      occurred_at: GRACE_SESSION.opened_at,
      actor: { user_id: "u2", first_name: "Grace" },
      authorized_by: null,
    };

    async function openCashScreen(
      cashDrawer: {
        cashSession?: CoreClient["cashSession"];
        cashMovements?: CoreClient["cashMovements"];
        recordCashMovement?: CoreClient["recordCashMovement"];
      } = {},
    ) {
      await page.viewport(1280, 720);
      onTestFinished(() => page.viewport(414, 896));
      const fake = coreAnswering(true, { kind: "enrolled" }, ADA_SIGNED_IN, {
        cashSession: async () => MOVER_SESSION,
        cashBalance: async () => BALANCE,
        cashMovements: async () => [OPENING],
        ...cashDrawer,
      });
      const screen = await render(<App core={fake.core} />);
      postCoreStatus("up");
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

    it("records a movement through the core and reads the movements again", async () => {
      const cashMovements = vi
        .fn<CoreClient["cashMovements"]>()
        .mockResolvedValueOnce([OPENING])
        .mockResolvedValueOnce([
          OPENING,
          { ...OPENING, id: "m2", type: "CASH_IN", reason: "Cambio", amount: 50_000 },
        ]);
      const { screen, recorded } = await openCashScreen({
        cashMovements,
        recordCashMovement: async () => ({ kind: "recorded", authorized_by: null }),
      });

      await recordCashIn(screen);

      await expect.element(screen.getByText("2 movimientos", { exact: true })).toBeVisible();
      expect(recorded).toEqual([{ kind: "CASH_IN", amount: 50_000, reason: "Cambio" }]);
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

      await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    });
  });
});
