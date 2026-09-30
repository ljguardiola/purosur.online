import type {
  EnrollmentOutcome,
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
  } = {},
  signOut: () => Promise<void> = async () => {},
) {
  const cashSessionAsks: string[] = [];
  const opened: number[] = [];
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
  return { core, asked, cashSessionAsks, opened, finishPull, usersLoads: () => usersLoads };
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
});
