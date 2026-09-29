import type { PermissionArea, PermissionKey } from "@purosur/domain";
import { TextField } from "@purosur/ui";
import type { DispatchableCdpSession } from "@purosur/ui/test";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { areaSelectedCount, RoleEditorForm } from "./role-editor-form";

// React Aria opens a tooltip only after a real pointer move; the first hover on a fresh page
// fires before that move and is silently dropped, so this throwaway move supplies it.
async function warmUpPointer() {
  await page.viewport(1280, 900);
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
}

const NO_PERMISSIONS_SELECTED: ReadonlySet<PermissionKey> = new Set();

function Harness({
  initialSelected = NO_PERMISSIONS_SELECTED,
  initialArea = "cashRegister" as PermissionArea,
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(initialSelected);
  const [selectedArea, setSelectedArea] = useState<PermissionArea>(initialArea);
  return (
    <RoleEditorForm
      nameField={
        <TextField
          kind="plain-text"
          label="Nombre del rol"
          value={name}
          onChange={setName}
          required
        />
      }
      selected={selected}
      onSelectedChange={setSelected}
      selectedArea={selectedArea}
      onSelectedAreaChange={setSelectedArea}
    />
  );
}

test("renders the name field and every area with a starting 0 de m count", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
  await expect.element(screen.getByRole("button", { name: /^Caja/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^Sucursal/ })).toBeVisible();
  expect(screen.getByText("0 de 7").elements().length).toBeGreaterThan(0);
});

test("the first area (Caja) is selected by default, showing its permissions", async () => {
  const screen = await render(<Harness />);

  await expect
    .element(
      screen.getByText("Vender y cobrar, incluido pesar a mano y abrir y cerrar su propia sesión"),
    )
    .toBeVisible();
});

test("selecting another area on the left shows its own title and permissions on the right", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByRole("button", { name: /^Stock/ }));

  await expect.element(screen.getByRole("heading", { name: /^Stock/, level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Ver saldos")).toBeVisible();
});

test("the detail pane's title names only the shown area, leaving its count to the areas pane", async () => {
  const screen = await render(<Harness initialArea="alerts" />);

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 2 })).toBeVisible();
});

test("groups the area buttons under an accessible name that says what they choose", async () => {
  const screen = await render(<Harness />);

  const areas = screen.getByRole("group", { name: "Áreas de permisos" });
  await expect.element(areas.getByRole("button", { name: /^Caja/ })).toBeVisible();
  await expect.element(areas.getByRole("button", { name: /^Sucursal/ })).toBeVisible();
});

test("checking a permission updates its area's n de m count", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByText("0 de 7").first()).toBeVisible();
  await userEvent.click(screen.getByText("Reimprimir un ticket").element());

  await expect.element(screen.getByText("1 de 7").first()).toBeVisible();
});

test("a permission used at the register shows a Caja tag, and one not used there shows none", async () => {
  const screen = await render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: /^Stock/ }));

  const registerRow = screen
    .getByText("Inventario inicial")
    .element()
    .closest("div")?.parentElement;
  const backofficeOnlyRow = screen.getByText("Ver saldos").element().closest("div")?.parentElement;
  expect(registerRow?.textContent).toContain("Caja");
  expect(registerRow?.textContent).not.toContain("PIN");
  expect(backofficeOnlyRow?.textContent).not.toContain("Caja");
});

test("a permission requiring another person's PIN shows both Caja and PIN tags, regardless of checked state", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByText("Reimprimir un ticket")).toBeVisible();
  const row = screen.getByText("Reimprimir un ticket").element().closest("div");
  expect(row?.parentElement?.textContent).toContain("Caja");
  expect(row?.parentElement?.textContent).toContain("PIN");
});

test("exposes each tag to assistive technology with an accessible role and name, and warns of none", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("img", { name: "Caja" }).first()).toBeInTheDocument();
  await expect.element(screen.getByRole("img", { name: "PIN" }).first()).toBeInTheDocument();
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("interactive ARIA role"));

  warn.mockRestore();
});

function tagInRow(row: HTMLElement | null | undefined, label: string): HTMLElement {
  const tag = Array.from(row?.querySelectorAll("span") ?? []).find(
    (span) => span.textContent === label,
  );
  if (!tag) {
    throw new Error(`test setup: no "${label}" tag found in the row`);
  }
  return tag;
}

test("hovering the Caja tag shows its meaning", async () => {
  await warmUpPointer();
  const screen = await render(<Harness />);
  const row = screen.getByText("Reimprimir un ticket").element().closest("div")?.parentElement;
  const tag = tagInRow(row, "Caja");

  await userEvent.hover(tag);

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Se usa en la caja.");
});

test("hovering the PIN tag shows its meaning", async () => {
  await warmUpPointer();
  const screen = await render(<Harness />);
  const row = screen.getByText("Reimprimir un ticket").element().closest("div")?.parentElement;
  const tag = tagInRow(row, "PIN");

  await userEvent.hover(tag);

  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent(
      "En la caja, si quien atiende no tiene el permiso, lo autoriza con su PIN alguien que sí lo tenga.",
    );
});

test("the Alertas area keeps its radio and separate dismiss checkbox, counted together", async () => {
  const screen = await render(<Harness initialArea="alerts" />);

  await expect.element(screen.getByRole("radio", { name: "No ve alertas" })).toBeChecked();
  await expect.element(screen.getByRole("button", { name: /^Alertas.*0 de 3$/ })).toBeVisible();

  await userEvent.click(screen.getByText("Ver alertas del local").element());
  await expect.element(screen.getByRole("button", { name: /^Alertas.*1 de 3$/ })).toBeVisible();

  await userEvent.click(screen.getByText("Cerrar alertas a mano").element());
  await expect.element(screen.getByRole("button", { name: /^Alertas.*2 de 3$/ })).toBeVisible();

  await userEvent.click(screen.getByText("Ver todas las alertas").element());
  await expect.element(screen.getByRole("button", { name: /^Alertas.*2 de 3$/ })).toBeVisible();
  await expect
    .element(screen.getByRole("radio", { name: "Ver alertas del local" }))
    .not.toBeChecked();
});

test("areaSelectedCount counts only the permissions selected in that area", () => {
  const selected = new Set<PermissionKey>(["sell_and_charge", "view_stock_balances"]);

  expect(areaSelectedCount("cashRegister", selected)).toEqual({ count: 1, total: 7 });
});

test("has no accessibility violations", async () => {
  const screen = await render(<Harness />);

  await expectNoAccessibilityViolations(screen.container);
});
