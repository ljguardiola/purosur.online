import type { EnrollmentOutcome, SignInOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreClient } from "../platform/core-client";
import { App } from "./app";

const SIGN_IN_TITLE = "¿Quién abre la caja?";
const SIGNED_IN_TITLE = "¿Qué querés hacer?";
const BRAND_LOGO_ALT = "Puro Sur";
const CORE_DOWN_TITLE = "Esperá un momento";
const ENROLLMENT_TITLE = "Dar de alta esta caja";

const ADA_SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { first_name: "Ada", permission_keys: ["sell_and_charge"] },
};

function coreAnswering(
  enrolled: boolean,
  outcome: EnrollmentOutcome = { kind: "enrolled" },
  signInOutcome: SignInOutcome = ADA_SIGNED_IN,
) {
  const asked: string[] = [];
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
    async signInUsers() {
      return [{ id: "u1", first_name: "Ada" }];
    },
    async signIn() {
      return signInOutcome;
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
  return { core, asked, finishPull };
}

const enrolledCore = coreAnswering(true).core;

function postCoreStatus(status: "starting" | "down" | "up"): void {
  window.postMessage({ channel: "core-status", payload: { type: "core-status", status } }, "*");
}

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
    await expect
      .element(screen.getByRole("complementary", { name: "Persona en la caja" }))
      .toHaveTextContent("Ada");
    await expect
      .element(screen.getByRole("heading", { name: SIGN_IN_TITLE }))
      .not.toBeInTheDocument();
  });

  it("stays on the sign-in screen when the PIN is wrong", async () => {
    const { core } = coreAnswering(true, { kind: "enrolled" }, { kind: "wrong_pin" });
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
});
