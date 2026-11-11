import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignInUsers } from "../platform/core-client";
import type { Screen } from "./test-support/sign-in-screen";
import {
  expectChosen,
  renderSignIn,
  roster,
  SIGNED_IN,
  USERS,
  userSelect,
} from "./test-support/sign-in-screen";

function failingOnce() {
  let attempts = 0;
  return {
    loadUsers: async (): Promise<SignInUsers> => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("the core could not read them");
      }
      return roster();
    },
    attempts: () => attempts,
  };
}

function pathname(screen: Screen) {
  return screen.router.state.location.pathname;
}

describe("SignInScreen last active user", () => {
  it("opens with the last active user selected", async () => {
    const screen = await renderSignIn({ loadUsers: async () => roster(USERS, "u2") });

    await expectChosen(screen, "Bruno");
  });

  it("opens with the first person in alphabetical order when nobody is marked", async () => {
    const screen = await renderSignIn({ loadUsers: async () => roster(USERS, null) });

    await expectChosen(screen, "Ada");
  });

  it("opens with the first person in alphabetical order when the marked one is not listed", async () => {
    const screen = await renderSignIn({ loadUsers: async () => roster(USERS, "gone") });

    await expectChosen(screen, "Ada");
  });

  it("signs in the last active user", async () => {
    const attempts: string[] = [];
    const screen = await renderSignIn({
      loadUsers: async () => roster(USERS, "u3"),
      signIn: async (userId) => {
        attempts.push(userId);
        return SIGNED_IN;
      },
    });

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    expect(attempts).toEqual(["u3"]);
  });
});

describe("SignInScreen keys", () => {
  it("shows the keys of the person and the PIN", async () => {
    const screen = await renderSignIn();

    await expect.element(screen.getByText("↑", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↓", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0-9", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
  });

  it("selects the next person with the down arrow and the previous one with the up arrow", async () => {
    const screen = await renderSignIn();
    await expectChosen(screen, "Ada");

    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Bruno");
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Carla");
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Carla");
    await userEvent.keyboard("{ArrowUp}");
    await expectChosen(screen, "Bruno");
  });

  it("clears the typed PIN when an arrow changes the person", async () => {
    const screen = await renderSignIn();
    await userEvent.type(screen.getByLabelText("PIN"), "12");

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
  });

  it("keeps the person while the PIN is being checked", async () => {
    let finish: () => void = () => {};
    const screen = await renderSignIn({
      signIn: () =>
        new Promise((resolve) => {
          finish = () => resolve(SIGNED_IN);
        }),
    });
    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await userEvent.keyboard("{ArrowDown}");

    await expectChosen(screen, "Ada");
    finish();
  });

  it("shows F2 and F3 on the links and goes to each screen with its key", async () => {
    const screen = await renderSignIn();
    await expect.element(screen.getByRole("link", { name: "Primer ingreso" })).toBeVisible();
    await expect.element(screen.getByText("F2", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();

    await userEvent.keyboard("{F2}");
    await vi.waitFor(() => expect(pathname(screen)).toBe("/first-sign-in"));
  });

  it("goes to the code redemption with F3", async () => {
    const screen = await renderSignIn();
    await expect.element(userSelect(screen)).toBeVisible();

    await userEvent.keyboard("{F3}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/pin-code-redemption"));
  });
});

describe("SignInScreen loading users", () => {
  it("shows the header, three placeholders and both links with their keys", async () => {
    const screen = await renderSignIn({ loadUsers: () => new Promise<SignInUsers>(() => {}) });

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("link", { name: "Primer ingreso" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Cambiar PIN con código" }))
      .toBeVisible();
    await expect.element(screen.getByText("F2", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });
});

describe("SignInScreen when the users could not be read", () => {
  it("shows the header, the notice, a Reintentar button with R and both links", async () => {
    const { loadUsers } = failingOnce();
    const screen = await renderSignIn({ loadUsers });

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("No se pudieron cargar los usuarios")).toBeVisible();
    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect.element(screen.getByText("R", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Primer ingreso" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Cambiar PIN con código" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tries again with R", async () => {
    const { loadUsers, attempts } = failingOnce();
    const screen = await renderSignIn({ loadUsers });
    await expect.element(screen.getByText("No se pudieron cargar los usuarios")).toBeVisible();

    await userEvent.keyboard("r");

    await expect.element(userSelect(screen)).toBeVisible();
    expect(attempts()).toBe(2);
  });
});

describe("SignInScreen when nobody has signed in yet", () => {
  it("shows the header, the message, a primary Primer ingreso with F2 and the link to change the PIN with F3", async () => {
    const screen = await renderSignIn({ loadUsers: async () => roster([]) });

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Todavía nadie ingresó en esta caja.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Primer ingreso" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Cambiar PIN con código" }))
      .toBeVisible();
    await expect.element(screen.getByText("F2", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes to the first sign-in with F2", async () => {
    const screen = await renderSignIn({ loadUsers: async () => roster([]) });
    await expect.element(screen.getByText("Todavía nadie ingresó en esta caja.")).toBeVisible();

    await userEvent.keyboard("{F2}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/first-sign-in"));
  });
});
