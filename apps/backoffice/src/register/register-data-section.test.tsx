import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { RegisterDataSection } from "./register-data-section";
import type { RegisterSummary } from "./registers-api";
import { createActions } from "./test-support/register-panel";
import {
  enrolledRegister,
  register1,
  register2,
  registerWithBitlockerKey,
  revokedRegister,
} from "./test-support/registers-list-screen";

const everything = accessWith(
  "registers_area",
  "enroll_registers",
  "revoke_installations",
  "bitlocker_recovery_key",
);

function renderSection(
  register: RegisterSummary,
  { access = everything, secondsSinceRead = 0 } = {},
) {
  const actions = createActions();
  return render(
    <RegisterDataSection
      register={register}
      access={access}
      actions={actions}
      secondsSinceRead={secondsSinceRead}
    />,
  ).then((screen) => ({ screen, actions }));
}

test("shows a register waiting for its installation with the code it issued and how long it lasts", async () => {
  const { screen } = await renderSection(register2);

  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});

test("counts the pending code down from the seconds elapsed since the list was read", async () => {
  const { screen } = await renderSection(register2, { secondsSinceRead: 60 });

  await expect.element(screen.getByText("Vence en 10 minutos")).toBeVisible();
});

test("shows an enrolled register's machine, when it enrolled and its Windows version", async () => {
  const { screen } = await renderSection(enrolledRegister);

  await expect.element(screen.getByText("CAJA-MOSTRADOR")).toBeVisible();
  await expect.element(screen.getByText("Dada de alta el 01/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Windows 11 Pro 10.0.26100")).toBeVisible();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
});

test("shows a revoked installation as Revocada with no action on it", async () => {
  const { screen } = await renderSection(revokedRegister);

  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Revocar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /BitLocker/ }).query()).toBeNull();
});

test("says whether the BitLocker recovery key is loaded", async () => {
  const unloaded = await renderSection(enrolledRegister);
  await expect.element(unloaded.screen.getByText("Clave de BitLocker: sin cargar")).toBeVisible();
  await unloaded.screen.unmount();

  const loaded = await renderSection(registerWithBitlockerKey);
  await expect.element(loaded.screen.getByText("Clave de BitLocker: cargada")).toBeVisible();
});

test("Emitir código de alta asks to emit the code of that register", async () => {
  const { screen, actions } = await renderSection(register1);

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta" }));

  expect(actions.emitCode).toHaveBeenCalledWith(register1);
});

test("Revocar asks to revoke an enrolled register", async () => {
  const { screen, actions } = await renderSection(enrolledRegister);

  await userEvent.click(screen.getByRole("button", { name: "Revocar" }));

  expect(actions.revoke).toHaveBeenCalledWith(enrolledRegister);
});

test("offers to load the recovery key of a register that has none, and to consult it once loaded", async () => {
  const withoutKey = await renderSection(enrolledRegister);
  await userEvent.click(
    withoutKey.screen.getByRole("button", { name: "Cargar la clave de BitLocker" }),
  );
  expect(withoutKey.actions.loadKey).toHaveBeenCalledWith(enrolledRegister);
  expect(
    withoutKey.screen.getByRole("button", { name: "Consultar la clave de BitLocker" }).query(),
  ).toBeNull();
  await withoutKey.screen.unmount();

  const withKey = await renderSection(registerWithBitlockerKey);
  await userEvent.click(
    withKey.screen.getByRole("button", { name: "Consultar la clave de BitLocker" }),
  );
  expect(withKey.actions.consultKey).toHaveBeenCalledWith(registerWithBitlockerKey);
});

test("offers each action only to who may do it", async () => {
  const onlyEnroll = await renderSection(enrolledRegister, {
    access: accessWith("registers_area", "enroll_registers"),
  });
  await expect
    .element(onlyEnroll.screen.getByRole("button", { name: "Emitir código de alta" }))
    .toBeVisible();
  expect(onlyEnroll.screen.getByRole("button", { name: "Revocar" }).query()).toBeNull();
  expect(onlyEnroll.screen.getByRole("button", { name: /BitLocker/ }).query()).toBeNull();
  expect(onlyEnroll.screen.getByText(/Clave de BitLocker/).query()).toBeNull();
  await onlyEnroll.screen.unmount();

  const onlyRevoke = await renderSection(enrolledRegister, {
    access: accessWith("registers_area", "revoke_installations"),
  });
  await expect.element(onlyRevoke.screen.getByRole("button", { name: "Revocar" })).toBeVisible();
  expect(
    onlyRevoke.screen.getByRole("button", { name: "Emitir código de alta" }).query(),
  ).toBeNull();
  await onlyRevoke.screen.unmount();

  const readOnly = await renderSection(enrolledRegister, { access: accessWith("registers_area") });
  await expect.element(readOnly.screen.getByText("CAJA-MOSTRADOR")).toBeVisible();
  expect(readOnly.screen.getByRole("button").query()).toBeNull();
});
