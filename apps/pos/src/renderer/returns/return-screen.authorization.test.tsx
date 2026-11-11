import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  chooseReturnLine,
  openReturn,
  renderScreen,
  typeTicket,
} from "./test-support/return-screen";
import { SALE } from "./test-support/sale-for-return";

const GRACE = { user_id: "u2", pin: "1234" };
const RETURN_LINE = {
  reason: "Defecto",
  disposition: "Descarte",
  resolution: "Reintegro",
} as const;

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
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
  });

  it("asks who authorizes in the modal, with the return's subtitle, when the core says the cashier lacks the permission", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });

    await typeTicket(screen);

    await expect
      .element(authorizationDialog().getByText("Devolución", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
  });

  it("looks the same ticket up again with who authorizes and their PIN on Enter", async () => {
    const findSaleForReturn = lackingPermissionUntilAuthorized();
    const { screen } = await renderScreen({ findSaleForReturn });
    await typeTicket(screen);

    await authorizeInModal({ as: "Grace", pin: "1234" });

    await vi.waitFor(() => expect(findSaleForReturn).toHaveBeenCalledTimes(2));
    expect(findSaleForReturn.mock.calls[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "typed" }), GRACE]),
    );
    await expect
      .element(screen.getByRole("heading", { name: "¿Coincide con el ticket en papel?" }))
      .toBeVisible();
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
  });

  it("does not look the ticket up again when the modal is closed with Esc", async () => {
    const findSaleForReturn = lackingPermissionUntilAuthorized();
    const { screen } = await renderScreen({ findSaleForReturn });
    await typeTicket(screen);
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("shows no notice of its own behind the modal while the modal asks", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });

    await typeTicket(screen);

    await expect.element(authorizationDialog()).toBeVisible();
    await expect
      .element(screen.getByText("Hacer devoluciones necesita permiso"))
      .not.toBeInTheDocument();
  });

  it("asks again, refusing nobody, when the ticket is looked up again after the modal was closed with Esc", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });
    await typeTicket(screen);
    await expect.element(authorizationDialog()).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(authorizationDialog()).not.toBeInTheDocument();

    await typeTicket(screen);

    await expect.element(authorizationDialog()).toBeVisible();
    await expect.element(authorizationDialog().getByLabelText("PIN")).toBeEnabled();
    await expect.element(page.getByText("Grace no puede autorizar esto")).not.toBeInTheDocument();
  });

  it("holds Esc and Autorizar while the ticket is looked up again with the authorization", async () => {
    let answer: (outcome: FindSaleForReturnOutcome) => void = () => {};
    const findSaleForReturn = vi.fn(
      (_reading: unknown, authorization: unknown): Promise<FindSaleForReturnOutcome> =>
        authorization === undefined
          ? Promise.resolve({ kind: "lacks_permission" })
          : new Promise((resolve) => {
              answer = resolve;
            }),
    );
    const { screen } = await renderScreen({ findSaleForReturn });
    await typeTicket(screen);

    await authorizeInModal({ as: "Grace", pin: "1234" });

    await vi.waitFor(() => expect(findSaleForReturn).toHaveBeenCalledTimes(2));
    await expect
      .element(authorizationDialog().getByRole("button", { name: "Autorizar" }))
      .toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect.element(authorizationDialog()).toBeVisible();
    answer({ kind: "found", sale: SALE });
    await expect
      .element(screen.getByRole("heading", { name: "¿Coincide con el ticket en papel?" }))
      .toBeVisible();
  });

  it("shows who authorized on the screen where the return is built, and sends it to complete", async () => {
    const { screen, completeReturn } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });
    await typeTicket(screen);
    await authorizeInModal({ as: "Grace", pin: "1234" });
    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));

    await expect.element(screen.getByText("Autorizó Grace").first()).toBeVisible();
    await chooseReturnLine(screen, "Pasta de maní 380 g", RETURN_LINE);
    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));

    expect(completeReturn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ authorization: GRACE }),
    );
  });

  it("shows a refused PIN inside the modal where the authorization was asked", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: vi.fn(async (_reading: unknown, authorization: unknown) =>
        authorization === undefined
          ? ({ kind: "lacks_permission" } as const)
          : ({ kind: "wrong_pin", attempts_left: 2, retry_after_seconds: 0 } as const),
      ),
    });
    await typeTicket(screen);

    await authorizeInModal({ as: "Grace", pin: "1234" });

    await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
  });

  it("asks again at the next return, leaving the one that ended without its authorization", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: lackingPermissionUntilAuthorized(),
    });
    await typeTicket(screen);
    await authorizeInModal({ as: "Grace", pin: "1234" });
    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir sin completar" }));

    await typeTicket(screen);

    await expect.element(authorizationDialog()).toBeVisible();
  });

  it("asks who authorizes in the modal when completing is refused for lack of permission, and completes on Enter", async () => {
    let attempts = 0;
    const { screen, completeReturn } = await renderScreen({
      completeReturn: vi.fn(async () => {
        attempts += 1;
        return attempts === 1
          ? { kind: "lacks_permission" as const }
          : { kind: "wrong_pin" as const, attempts_left: 2, retry_after_seconds: 0 };
      }),
    });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", RETURN_LINE);

    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));

    await expect
      .element(authorizationDialog().getByText("Devolución", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    await authorizeInModal({ as: "Grace", pin: "1234" });
    await vi.waitFor(() => expect(completeReturn).toHaveBeenCalledTimes(2));
    expect(completeReturn).toHaveBeenLastCalledWith(
      expect.objectContaining({ authorization: GRACE }),
    );
    await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
  });

  it("does not complete the return when the modal is closed with Esc", async () => {
    const { screen, completeReturn } = await renderScreen({
      completeReturn: vi.fn(async () => ({ kind: "lacks_permission" as const })),
    });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", RETURN_LINE);
    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(completeReturn).toHaveBeenCalledOnce();
  });
});
