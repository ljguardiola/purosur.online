import { actionsColumn, Table, useTableModel } from "@purosur/ui";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { type RegisterActions, registerRowActions } from "./register-row-actions";
import type { RegisterSummary } from "./registers-api";
import { createActions } from "./test-support/register-panel";
import { enrolledRegister, register1 } from "./test-support/registers-list-screen";

function RowActionsTable({
  registers,
  access,
  actions,
}: {
  registers: RegisterSummary[];
  access: BackofficeAccess;
  actions: RegisterActions;
}) {
  const table = useTableModel({
    items: registers,
    id: (register) => register.id,
    columns: [
      actionsColumn({ id: "actions", header: "Acciones", ...registerRowActions(access, actions) }),
    ] as const,
  });
  return <Table aria-label="Cajas registradoras" table={table} />;
}

async function renderRow(
  register: RegisterSummary,
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
) {
  await page.viewport(1280, 900);
  const actions = createActions();
  const screen = await render(
    <RowActionsTable registers={[register]} access={access} actions={actions} />,
  );
  return { screen, actions };
}

test("keeps the first three row actions inline and puts the Point terminal and the Mercado Pago QR in Más acciones", async () => {
  const { screen } = await renderRow(enrolledRegister);

  await expect
    .element(screen.getByRole("button", { name: /^Cargar la clave de recuperación de BitLocker/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /^Revocar por pérdida o robo/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /^Emitir código de alta/ }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Asignar/ }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await expect
    .element(page.getByRole("menuitem", { name: "Asignar terminal Point" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("menuitem", { name: "Asignar QR de Mercado Pago" }))
    .toBeVisible();
});

test("shows a row with three actions inline, with no Más acciones menu", async () => {
  const { screen } = await renderRow(register1);

  await expect
    .element(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Asignar terminal Point a Caja 1" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Asignar QR de Mercado Pago a Caja 1" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("puts only the fourth action of a row in Más acciones", async () => {
  const { screen } = await renderRow(
    enrolledRegister,
    accessWith(
      "registers_area",
      "enroll_registers",
      "bitlocker_recovery_key",
      "fiscal_configuration_area",
    ),
  );

  await expect
    .element(screen.getByRole("button", { name: /^Cargar la clave de recuperación de BitLocker/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /^Emitir código de alta/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Asignar terminal Point a Caja 3" }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await expect
    .element(page.getByRole("menuitem", { name: "Asignar QR de Mercado Pago" }))
    .toBeVisible();
  expect(page.getByRole("menuitem").elements()).toHaveLength(1);
});

test("offers no Más acciones menu to who may not assign a terminal or a QR", async () => {
  const { screen } = await renderRow(
    enrolledRegister,
    accessWith("registers_area", "enroll_registers", "revoke_installations"),
  );
  await expect
    .element(screen.getByRole("button", { name: /^Emitir código de alta/ }))
    .toBeVisible();

  expect(screen.getByRole("button", { name: "Más acciones" }).query()).toBeNull();
});

test("an inline action and a Más acciones entry each act on their row's register", async () => {
  const { screen, actions } = await renderRow(enrolledRegister);

  await userEvent.click(screen.getByRole("button", { name: /^Revocar por pérdida o robo/ }));
  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Asignar QR de Mercado Pago" }));

  expect(actions.revoke).toHaveBeenCalledWith(enrolledRegister);
  expect(actions.assignQr).toHaveBeenCalledWith(enrolledRegister);
});
