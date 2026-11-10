import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { RegisterFrame } from "./register-frame";
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
});
