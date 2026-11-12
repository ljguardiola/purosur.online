import { describe, expect, it, onTestFinished } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FramePanel, RegisterFrame } from "./register-frame";
import type { RegisterStatusData } from "./register-status-context";
import { RegisterStatusProvider } from "./register-status-context";

const STATUS: RegisterStatusData = {
  person: { user_id: "u1", first_name: "Ada", abilities: [] },
  registerName: "Caja 1",
  cashSession: { status: "none" },
  status: {
    status: "loaded",
    value: {
      conditions: [],
      cloud: "unreachable",
      serial_devices: { scale: "matching", reader: "matching" },
      serial_devices_setup_offered: false,
      contingency: null,
    },
    refreshing: false,
  },
  backupTickets: { status: "loading" },
  onDiscardBackupTickets: () => {},
};

function frame() {
  return (
    <RegisterFrame
      background="surface"
      rail={<nav aria-label="Riel">riel</nav>}
      aside={<aside aria-label="Panel">panel</aside>}
    >
      <main>contenido</main>
    </RegisterFrame>
  );
}

describe("RegisterFrame", () => {
  it("shows the rail, the content and the panel, and no header, when no status is provided", async () => {
    const screen = await render(frame());

    await expect.element(screen.getByRole("navigation", { name: "Riel" })).toBeVisible();
    await expect.element(screen.getByRole("main")).toBeVisible();
    await expect.element(screen.getByRole("complementary", { name: "Panel" })).toBeVisible();
    await expect
      .element(screen.getByRole("region", { name: "Estado de la caja" }))
      .not.toBeInTheDocument();
  });

  it("ends the header's crumbs with the crumb of its screen", async () => {
    const screen = await render(
      <RegisterStatusProvider value={STATUS}>
        <RegisterFrame background="surface" rail={null} crumb="Antes de empezar">
          <main>contenido</main>
        </RegisterFrame>
      </RegisterStatusProvider>,
    );

    await expect
      .element(screen.getByRole("region", { name: "Estado de la caja" }))
      .toMatchTextContent(/^CAJA 1•Ada•Antes de empezar/);
  });

  it("shows the header above the content, between the rail and the panel", async () => {
    const screen = await render(
      <RegisterStatusProvider value={STATUS}>{frame()}</RegisterStatusProvider>,
    );

    const header = screen
      .getByRole("region", { name: "Estado de la caja" })
      .element()
      .getBoundingClientRect();
    const rail = screen.getByRole("navigation", { name: "Riel" }).element().getBoundingClientRect();
    const panel = screen
      .getByRole("complementary", { name: "Panel" })
      .element()
      .getBoundingClientRect();
    const content = screen.getByRole("main").element().getBoundingClientRect();
    expect(header.bottom).toBeLessThanOrEqual(content.top);
    expect(header.left).toBeGreaterThanOrEqual(rail.right);
    expect(header.right).toBeLessThanOrEqual(panel.left);
    expect(panel.top).toBeLessThan(header.top + 1);
  });

  it("covers the aside with a panel rendered through the frame's panel slot, from the rail", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const screen = await render(
      <div style={{ height: "600px", width: "1024px" }}>
        <RegisterFrame
          background="surface"
          rail={
            <nav aria-label="Riel">
              <FramePanel>
                <section aria-label="Confirmación" style={{ width: "100%" }}>
                  confirmar
                </section>
              </FramePanel>
            </nav>
          }
          aside={
            <aside aria-label="Panel" style={{ width: "392px" }}>
              panel
            </aside>
          }
        >
          <main>contenido</main>
        </RegisterFrame>
      </div>,
    );

    const aside = screen
      .getByRole("complementary", { name: "Panel" })
      .element()
      .getBoundingClientRect();
    const covering = screen
      .getByRole("region", { name: "Confirmación" })
      .element()
      .getBoundingClientRect();
    expect(covering.left).toBeLessThanOrEqual(aside.left);
    expect(covering.right).toBeGreaterThanOrEqual(aside.right);
    expect(covering.top).toBeLessThanOrEqual(aside.top);
    expect(covering.bottom).toBeGreaterThanOrEqual(aside.bottom);
    expect(document.elementFromPoint(aside.left + 10, aside.top + 10)).toBe(
      screen.getByRole("region", { name: "Confirmación" }).element(),
    );
  });

  it("shows no panel when nothing is rendered through the slot", async () => {
    const screen = await render(frame());

    await expect
      .element(screen.getByRole("region", { name: "Confirmación" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("complementary", { name: "Panel" })).toBeVisible();
  });
});
