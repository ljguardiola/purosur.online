import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render as renderInBrowser } from "vitest-browser-react";
import { KeyLayerProvider } from "../platform/key-layer";
import { DeferredSaleCodeForm } from "./deferred-sale-code-form";

const CODE_FIELD = { name: /Código de consulta/ } as const;
const INVALID_CODE = "El código tiene 8 letras y números, como 7KQ4-M2P9.";

async function render(props: Partial<ComponentProps<typeof DeferredSaleCodeForm>> = {}) {
  const onLook = vi.fn();
  const screen = await renderInBrowser(
    <KeyLayerProvider>
      <DeferredSaleCodeForm
        disabled={false}
        lookingUp={false}
        keysActive
        onLook={onLook}
        {...props}
      />
    </KeyLayerProvider>,
  );
  return { screen, onLook, field: screen.getByRole("textbox", CODE_FIELD) };
}

describe("DeferredSaleCodeForm", () => {
  it("shows the field with its F2 key", async () => {
    const { screen } = await render();

    await expect.element(screen.getByText("SI EL LECTOR NO LEE EL QR")).toBeVisible();
    await expect.element(screen.getByText("F2")).toBeVisible();
  });

  it("focuses the field with F2", async () => {
    const { field } = await render();

    await userEvent.keyboard("{F2}");

    await expect.element(field).toHaveFocus();
  });

  it("hands over the code as typed when Buscar venta is pressed", async () => {
    const { screen, onLook, field } = await render();
    await userEvent.fill(field, "7kq4-m2p9");

    await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));

    await vi.waitFor(() =>
      expect(onLook).toHaveBeenCalledExactlyOnceWith({ kind: "typed", code: "7kq4-m2p9" }),
    );
  });

  it("hands over the code on Enter in the field", async () => {
    const { onLook, field } = await render();
    await userEvent.fill(field, "7KQ4M2P9");

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(onLook).toHaveBeenCalledExactlyOnceWith({ kind: "typed", code: "7KQ4M2P9" }),
    );
  });

  it("hands over the same code again when it is submitted twice", async () => {
    const { onLook, field } = await render();
    await userEvent.fill(field, "7KQ4M2P9");

    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(onLook).toHaveBeenCalledTimes(1));
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onLook).toHaveBeenCalledTimes(2));
  });

  it("refuses a code that is not a short code, saying how it is made, without handing it over", async () => {
    const { screen, onLook, field } = await render();
    await userEvent.fill(field, "7KQ4");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(INVALID_CODE)).toBeVisible();
    expect(onLook).not.toHaveBeenCalled();
  });

  it("disables the field and Buscar venta and leaves F2 without effect while disabled", async () => {
    const { screen, field } = await render({ disabled: true });

    await userEvent.keyboard("{F2}");

    await expect.element(field).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Buscar venta" })).toBeDisabled();
    await expect.element(field).not.toHaveFocus();
  });

  it("keeps Buscar venta loading and ignores Enter in the field while a lookup is in flight", async () => {
    const { screen, onLook, field } = await render({ lookingUp: true });
    await userEvent.fill(field, "7KQ4M2P9");

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("button", { name: "Buscar venta" })).toBeDisabled();
    await expect.element(field).toBeEnabled();
    expect(onLook).not.toHaveBeenCalled();
  });

  it("leaves F2 without effect while its keys are off", async () => {
    const { field } = await render({ keysActive: false });

    await userEvent.keyboard("{F2}");

    await expect.element(field).not.toHaveFocus();
  });
});
