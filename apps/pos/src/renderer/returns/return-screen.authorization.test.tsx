import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RenderedScreen } from "./test-support/return-screen";
import {
  chooseReturnLine,
  openReturn,
  QR_TEXT,
  renderScreen,
  typeTicket,
} from "./test-support/return-screen";
import { SALE } from "./test-support/sale-for-return";

const GRACE = { user_id: "u2", pin: "1234" };

async function authorizeAs(screen: RenderedScreen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

function lackingPermissionUntilAuthorized() {
  return vi.fn(async (_reading: unknown, authorization: { user_id: string } | undefined) =>
    authorization === undefined
      ? ({ kind: "lacks_permission" } as const)
      : ({ kind: "found", sale: SALE } as const),
  );
}

describe("ReturnScreen asking someone with permission to authorize", () => {
  it("does not ask for an authorization before the core says the cashier lacks the permission", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
  });

  it("asks who authorizes, once, when the core says the cashier lacks the permission", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });

    await typeTicket(screen);

    await expect.element(screen.getByText("Hacer devoluciones necesita permiso")).toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    await expect
      .element(screen.getByText("Tomás no tiene permiso para hacer devoluciones."))
      .toBeVisible();
  });

  it("looks the sale up again with who authorizes and their PIN", async () => {
    const findSaleForReturn = lackingPermissionUntilAuthorized();
    const { screen, readBarcode } = await renderScreen({ findSaleForReturn });
    await typeTicket(screen);
    await authorizeAs(screen, "Grace", "1234");

    readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(findSaleForReturn).toHaveBeenLastCalledWith({ kind: "scanned", text: QR_TEXT }, GRACE),
    );
    await expect
      .element(screen.getByRole("heading", { name: "¿Coincide con el ticket en papel?" }))
      .toBeVisible();
  });

  it("shows who authorized on the screen where the return is built, and sends it to complete", async () => {
    const { screen, completeReturn } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });
    await typeTicket(screen);
    await authorizeAs(screen, "Grace", "1234");
    await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));
    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));

    await expect.element(screen.getByText("Autorizó Grace")).toBeVisible();
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
    });
    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));

    expect(completeReturn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ authorization: GRACE }),
    );
  });

  it("shows a refused PIN where the authorization was asked", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: vi.fn(async (_reading: unknown, authorization: unknown) =>
        authorization === undefined
          ? ({ kind: "lacks_permission" } as const)
          : ({ kind: "wrong_pin", attempts_left: 2, retry_after_seconds: 0 } as const),
      ),
    });
    await typeTicket(screen);
    await authorizeAs(screen, "Grace", "1234");
    await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
  });

  it("asks again at the next return, leaving the one that ended without its authorization", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });
    await typeTicket(screen);
    await authorizeAs(screen, "Grace", "1234");
    await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));
    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir sin completar" }));

    await openReturn(screen);

    await expect.element(screen.getByText("Hacer devoluciones necesita permiso")).toBeVisible();
  });

  it("asks who authorizes when completing is refused for lack of permission", async () => {
    const { screen } = await renderScreen({
      completeReturn: async () => ({ kind: "lacks_permission" }),
    });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
    });

    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
  });
});
