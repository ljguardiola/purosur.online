import { Info } from "lucide-react";
import { useState } from "react";
import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Modal } from "../overlays/modal";
import { SuppliersArea } from "./test-support/detail-panel";

const WIDE_AREA = 1200;

beforeEach(async () => {
  await page.viewport(1280, 800);
});

test("moves focus to its title on open and back to the pressed row on close", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  const row = screen.getByRole("button", { name: "Almacén Sur" });

  await row.click();

  await expect.element(screen.getByRole("heading", { name: "Almacén Sur" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
  await expect.element(row).toHaveFocus();
});

test("closes on Escape while focus is on content inside it", async () => {
  const screen = await render(
    <SuppliersArea areaWidth={WIDE_AREA}>
      <button type="button">Editar datos</button>
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();

  await screen.getByRole("button", { name: "Editar datos" }).click();
  await userEvent.keyboard("{Escape}");

  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
});

test("does not close on Escape pressed outside it, and leaves the list usable", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();
  const otherRow = screen.getByRole("button", { name: "Almacén Sur" });
  (otherRow.element() as HTMLElement).focus();

  await userEvent.keyboard("{Escape}");

  await expect
    .element(screen.getByRole("complementary", { name: "Distribuidora Norte" }))
    .toBeVisible();
});

function ConfirmationInsidePanel({ closable }: { closable: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setConfirming(true)}>
        Eliminar proveedor
      </button>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        closable={closable}
        tone="info"
        icon={<Info />}
        title="Eliminar proveedor"
        footer={<span />}
      >
        Confirmar
      </Modal>
    </>
  );
}

test.each([true, false])(
  "keeps itself open when Escape is handled by a modal opened from its content (closable: %s)",
  async (closable) => {
    const screen = await render(
      <SuppliersArea areaWidth={WIDE_AREA}>
        <ConfirmationInsidePanel closable={closable} />
      </SuppliersArea>,
    );
    await screen.getByRole("button", { name: "Almacén Sur" }).click();
    await screen.getByRole("button", { name: "Eliminar proveedor" }).click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("complementary", { name: "Almacén Sur" })).toBeVisible();
  },
);
