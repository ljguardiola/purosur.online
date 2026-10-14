import { userEvent } from "vitest/browser";
import type { render } from "../../shell/test-support/render-with-router";

type Screen = Awaited<ReturnType<typeof render>>;

export type FreightDialog = ReturnType<Screen["getByRole"]>;

export type FreightFill = {
  date?: string;
  amount?: string;
  carrierName?: string;
  description?: string;
  ownTrip?: boolean;
  suppliers?: string[];
};

export async function toggle(dialog: FreightDialog, label: string) {
  await userEvent.click(dialog.getByText(label, { exact: true }).element());
}

export async function fillFreight(dialog: FreightDialog, fill: FreightFill) {
  if (fill.date !== undefined) {
    await userEvent.click(
      dialog
        .getByRole("group", { name: /^Fecha/ })
        .getByRole("spinbutton")
        .first(),
    );
    await userEvent.keyboard(fill.date);
  }
  if (fill.amount !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Monto/ }), fill.amount);
  }
  if (fill.ownTrip === true) {
    await toggle(dialog, "Viaje propio (costo estimado)");
  }
  if (fill.carrierName !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Medio/ }), fill.carrierName);
  }
  if (fill.description !== undefined) {
    await userEvent.fill(dialog.getByRole("textbox", { name: /^Descripción/ }), fill.description);
  }
  for (const supplier of fill.suppliers ?? []) {
    await toggle(dialog, supplier);
  }
}
