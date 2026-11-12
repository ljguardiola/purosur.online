import type { RegisterAbility } from "@purosur/domain";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { useKeys } from "../platform/key-layer";
import { NoSessionRail } from "./no-session-rail";
import { RegisterFrame } from "./register-frame";
import type { SignedInPerson } from "./signed-in-person";
import { escapeHandled } from "./test-support/escape-handled";
import { render } from "./test-support/render-with-router";

const EVERY_ENTRY: readonly RegisterAbility[] = [
  "view_sales_history",
  "configure_receipt_printer",
  "configure_serial_devices",
];

function personWith(abilities: readonly RegisterAbility[]): SignedInPerson {
  return { user_id: "u1", first_name: "Ada", abilities: [...abilities] };
}

function renderInFrame(rail: ReactNode) {
  return render(
    <div data-testid="frame" style={{ height: "600px", width: "1024px" }}>
      <RegisterFrame
        background="surface"
        rail={rail}
        aside={<aside aria-label="Panel">panel</aside>}
      >
        <main>
          <input aria-label="Buscar" />
        </main>
      </RegisterFrame>
    </div>,
  );
}

function ScreenKeys({ run }: { run: (pressed: string) => void }) {
  useKeys([
    { key: "Delete", run },
    { key: "ArrowUpDown", run },
    { key: "F12", run },
  ]);
  return null;
}

function railItems(screen: Awaited<ReturnType<typeof render>>) {
  return Array.from(
    screen
      .getByRole("navigation", { name: "Menú de la caja" })
      .element()
      .querySelectorAll("button, a"),
  ).map((item) => item.textContent);
}

describe("NoSessionRail", () => {
  it.each([
    [undefined, "Inicio"],
    ["/history", "Historial"],
    ["/receipt-printer", "Impresora"],
    ["/serial-devices", "Balanza y lector"],
  ] as const)(
    "lists every entry the person may use on %s, with %s as the current one",
    async (current, open) => {
      const screen = await render(
        <NoSessionRail person={personWith(EVERY_ENTRY)} current={current} signOut={vi.fn()} />,
      );

      expect(railItems(screen)).toEqual([
        "Inicio",
        "Historial",
        "Impresora",
        "Balanza y lector",
        "Salir",
      ]);
      const currentItems = Array.from(
        screen.container.querySelectorAll("[aria-current='page']"),
      ).map((item) => item.textContent);
      expect(currentItems).toEqual([open]);
    },
  );

  it("leaves out the entries the person may not use", async () => {
    const screen = await render(
      <NoSessionRail person={personWith(["view_sales_history"])} signOut={vi.fn()} />,
    );

    expect(railItems(screen)).toEqual(["Inicio", "Historial", "Salir"]);
  });

  it("sends Inicio home from any other screen", async () => {
    const screen = await render(
      <NoSessionRail person={personWith(EVERY_ENTRY)} current="/history" signOut={vi.fn()} />,
    );

    expect(screen.getByRole("link", { name: "Inicio" }).element().getAttribute("href")).toBe("/");
  });

  it("goes back home on Escape from another screen", async () => {
    const screen = await render(
      <NoSessionRail person={personWith(EVERY_ENTRY)} current="/history" signOut={vi.fn()} />,
    );
    await screen.router.navigate({ to: "/history" });

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/");
  });

  it("leaves Escape unhandled at home", async () => {
    const screen = await render(
      <NoSessionRail person={personWith(EVERY_ENTRY)} signOut={vi.fn()} />,
    );
    const handled = escapeHandled();

    await userEvent.keyboard("{Escape}");

    expect(handled()).toBe(false);
    expect(screen.router.state.location.pathname).toBe("/");
  });

  it("shows no confirmation until Salir is pressed, and Salir is not the current item", async () => {
    const screen = await renderInFrame(<NoSessionRail person={personWith([])} signOut={vi.fn()} />);

    await expect
      .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("navigation").getByRole("button", { name: "Salir" }))
      .not.toHaveAttribute("aria-current");
  });

  describe("confirming Salir", () => {
    async function openConfirmation(signOut = vi.fn(), current?: "/history") {
      const screen = await renderInFrame(
        <NoSessionRail
          person={personWith(["view_sales_history"])}
          current={current}
          signOut={signOut}
        />,
      );
      await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .toBeVisible();
      return screen;
    }

    it("opens the panel over the frame's aside, with the person's first name and Salir selected in the rail", async () => {
      const screen = await openConfirmation();

      const panel = screen.getByRole("complementary", { name: "¿Salir de la caja?" });
      await expect.element(panel).toBeVisible();
      await expect
        .element(panel.getByRole("heading", { name: "¿Salir de la caja?" }))
        .toBeVisible();
      await expect.element(panel.getByText("Persona")).toBeVisible();
      await expect.element(panel.getByText("Ada")).toBeVisible();
      await expect
        .element(screen.getByRole("navigation").getByRole("button", { name: "Salir" }))
        .toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("dialog").elements()).toHaveLength(0);
      const box = panel.element().getBoundingClientRect();
      const frame = screen.getByTestId("frame").element().getBoundingClientRect();
      expect(box.right).toBeCloseTo(frame.right, 0);
      expect(box.top).toBeCloseTo(frame.top, 0);
      expect(box.bottom).toBeCloseTo(frame.bottom, 0);
    });

    it("shows the Esc key at the top right and the Enter key on Salir at the bottom", async () => {
      const screen = await openConfirmation();

      const panel = screen.getByRole("complementary", { name: "¿Salir de la caja?" });
      expect(
        panel.getByRole("button", { name: "Cerrar con Esc" }).element().querySelector("kbd")
          ?.textContent,
      ).toBe("Esc");
      expect(
        panel.getByRole("button", { name: "Salir" }).element().querySelector("kbd")?.textContent,
      ).toBe("Enter");
    });

    it("leaves when Salir is pressed in the panel", async () => {
      const signOut = vi.fn();
      const screen = await openConfirmation(signOut);

      await userEvent.click(
        screen
          .getByRole("complementary", { name: "¿Salir de la caja?" })
          .getByRole("button", { name: "Salir" }),
      );

      expect(signOut).toHaveBeenCalledOnce();
    });

    it("leaves on Enter with no other key pressed first", async () => {
      const signOut = vi.fn();
      await openConfirmation(signOut);

      await userEvent.keyboard("{Enter}");

      expect(signOut).toHaveBeenCalledOnce();
    });

    it("closes without leaving on Enter while the Esc key is focused", async () => {
      const signOut = vi.fn();
      const screen = await openConfirmation(signOut);
      screen.getByRole("button", { name: "Cerrar con Esc" }).element().focus();

      await userEvent.keyboard("{Enter}");

      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .not.toBeInTheDocument();
      expect(signOut).not.toHaveBeenCalled();
    });

    it("does not leave on Enter pressed in a field of the screen behind the panel", async () => {
      const signOut = vi.fn();
      const screen = await openConfirmation(signOut);
      await userEvent.click(screen.getByRole("textbox", { name: "Buscar" }));

      await userEvent.keyboard("{Enter}");

      expect(signOut).not.toHaveBeenCalled();
      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .toBeVisible();
    });

    it("closes on Escape without leaving and without leaving the screen it is on", async () => {
      const signOut = vi.fn();
      const screen = await openConfirmation(signOut, "/history");
      await screen.router.navigate({ to: "/history" });

      await userEvent.keyboard("{Escape}");

      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .not.toBeInTheDocument();
      expect(signOut).not.toHaveBeenCalled();
      expect(screen.router.state.location.pathname).toBe("/history");
      await expect
        .element(screen.getByRole("navigation").getByRole("button", { name: "Salir" }))
        .not.toHaveAttribute("aria-current");
    });

    it("keeps the keys of the screen behind it from acting while it is open", async () => {
      const screenKey = vi.fn();
      const screen = await renderInFrame(
        <>
          <ScreenKeys run={screenKey} />
          <NoSessionRail person={personWith([])} signOut={vi.fn()} />
        </>,
      );
      await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .toBeVisible();

      await userEvent.keyboard("{Delete}{ArrowDown}{F12}");
      await userEvent.click(screen.getByRole("textbox", { name: "Buscar" }));
      await userEvent.keyboard("{Delete}{ArrowDown}{F12}");

      expect(screenKey).not.toHaveBeenCalled();
    });

    it("closes when the Esc key is pressed with the pointer, without leaving", async () => {
      const signOut = vi.fn();
      const screen = await openConfirmation(signOut);

      await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

      await expect
        .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
        .not.toBeInTheDocument();
      expect(signOut).not.toHaveBeenCalled();
    });

    it("ignores Enter once the panel is closed", async () => {
      const signOut = vi.fn();
      await openConfirmation(signOut);
      await userEvent.keyboard("{Escape}");

      await userEvent.keyboard("{Enter}");

      expect(signOut).not.toHaveBeenCalled();
    });
  });
});
