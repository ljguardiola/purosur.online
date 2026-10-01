import type { PriceProduct } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PriceChangeModal, type PriceChangeModalProps } from "./price-change-modal";

const NOW = () => new Date("2026-09-25T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const withoutPrice: PriceProduct = {
  id: "product-1",
  name: "Fideos",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  currentPrice: null,
  daysSinceReview: null,
  pending: true,
};

const rice: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: {
    id: "00000000-0000-4000-8000-000000000001",
    unitPrice: 750000,
    validFrom: new Date(NOW().getTime() - 40 * DAY_MS).toISOString(),
  },
  daysSinceReview: 40,
  pending: true,
};

function createProps(overrides: Partial<PriceChangeModalProps> = {}): PriceChangeModalProps {
  return {
    target: rice,
    previousProductNotice: null,
    onClose: vi.fn(),
    onSessionEnded: vi.fn(),
    onSaved: vi.fn(),
    onGone: vi.fn(),
    reload: vi.fn(),
    setPrice: vi.fn(),
    confirmPrice: vi.fn(),
    ...overrides,
  };
}

function modalElement(props: PriceChangeModalProps) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PriceChangeModal {...props} />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(props: PriceChangeModalProps) {
  const screen = await render(modalElement(props));
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  return screen;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("shows the reason a typed price can't be saved without calling the server", async () => {
  const props = createProps();
  const screen = await renderModal(props);

  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByText("Ingresá el precio nuevo.")).toBeVisible();
  expect(props.setPrice).not.toHaveBeenCalled();
});

test("sends the typed price in cents", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "7.500,50");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => vi.mocked(props.setPrice).mock.lastCall?.[1].unitPrice).toBe(750050);
});

test("shows a stale-price notice on a 409 and offers to reload the row's current price", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "stale_price" });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
});

test("a product that no longer exists disables the modal's actions and tells the screen it is gone", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal(props);

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  expect(props.onGone).toHaveBeenCalledWith(rice);
});

test("confirming a product that no longer exists keeps the modal open on its not-found notice and tells the screen it is gone", async () => {
  const props = createProps();
  vi.mocked(props.confirmPrice).mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal(props);

  await userEvent.click(screen.getByRole("button", { name: "Confirmar sin cambios" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  expect(props.onGone).toHaveBeenCalledWith(rice);
  expect(props.onClose).not.toHaveBeenCalled();
});

test("reloading a stale price for a product that is no longer listed shows its not-found notice and tells the screen it is gone", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "stale_price" });
  vi.mocked(props.reload).mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  expect(props.reload).toHaveBeenCalledWith("product-2");
  expect(props.onGone).toHaveBeenCalledWith(rice);
});

test("the modal cannot be closed while its save is in flight", async () => {
  const props = createProps();
  const pending = deferred<Awaited<ReturnType<PriceChangeModalProps["setPrice"]>>>();
  vi.mocked(props.setPrice).mockReturnValue(pending.promise);
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();

  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await userEvent.click(dialog.getByLabelText("Precio de venta por kilo"));
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  expect(props.onClose).not.toHaveBeenCalled();

  pending.resolve({ kind: "failed" });
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("a notice about a previous product leaves the modal once the modal shows its own", async () => {
  const props = createProps({
    previousProductNotice: {
      tone: "success",
      title: "Precio actualizado",
      description: "Fideos pasa a $ 1,00.",
    },
  });
  vi.mocked(props.confirmPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect.element(dialog.getByText("No se pudo confirmar el precio")).toBeVisible();
  await expect.poll(() => dialog.getByText("Fideos pasa a $ 1,00.").query()).toBeNull();
});

test("a save that throws ends in the save-failed notice and the modal can be closed again", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockRejectedValue(new Error("network down"));
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("No se pudo guardar el precio")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("a confirmation that throws ends in the confirm-failed notice and the modal can be closed again", async () => {
  const props = createProps();
  vi.mocked(props.confirmPrice).mockRejectedValue(new Error("network down"));
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect.element(dialog.getByText("No se pudo confirmar el precio")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test.each([
  {
    action: "save",
    setUp: (props: PriceChangeModalProps) =>
      vi.mocked(props.setPrice).mockResolvedValue({ kind: "failed" }),
    title: "No se pudo guardar el precio",
    description: "Probá de nuevo.",
  },
  {
    action: "save",
    setUp: (props: PriceChangeModalProps) =>
      vi.mocked(props.setPrice).mockResolvedValue({
        kind: "rate_limited",
        retryAfterSeconds: 120,
      }),
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 2 minutos.",
  },
  {
    action: "confirm",
    setUp: (props: PriceChangeModalProps) =>
      vi.mocked(props.confirmPrice).mockResolvedValue({ kind: "failed" }),
    title: "No se pudo confirmar el precio",
    description: "Probá de nuevo.",
  },
  {
    action: "confirm",
    setUp: (props: PriceChangeModalProps) =>
      vi.mocked(props.confirmPrice).mockResolvedValue({
        kind: "rate_limited",
        retryAfterSeconds: 120,
      }),
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 2 minutos.",
  },
])("a modal $action that fails shows $title", async ({ action, setUp, title, description }) => {
  const props = createProps();
  setUp(props);
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  if (action === "save") {
    await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
    await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  } else {
    await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));
  }

  await expect.element(dialog.getByText(title)).toBeVisible();
  await expect.element(dialog.getByText(description)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("the current price typed again is sent to the server, which decides it is unchanged", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "price_unchanged" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "7.500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .element(dialog.getByText("Es el precio actual: confirmalo sin cambios en vez de guardarlo."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(props.setPrice).mock.calls.length).toBe(1);
});

test("the server answering that the price is unchanged shows the same unchanged-price error", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "price_unchanged" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .element(dialog.getByText("Es el precio actual: confirmalo sin cambios en vez de guardarlo."))
    .toBeVisible();
});

test("a reloaded price is shown and becomes the one the next save and confirmation expect", async () => {
  const props = createProps();
  vi.mocked(props.reload).mockResolvedValue({
    kind: "found",
    product: {
      ...rice,
      currentPrice: {
        id: "00000000-0000-4000-8000-000000000009",
        unitPrice: 900000,
        validFrom: "2026-09-25T00:00:00.000Z",
      },
    },
  });
  vi.mocked(props.setPrice)
    .mockResolvedValueOnce({ kind: "stale_price" })
    .mockResolvedValue({ kind: "failed" });
  vi.mocked(props.confirmPrice).mockResolvedValue({ kind: "failed" });

  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByText("Precio actual: $ 9.000,00 / kg")).toBeVisible();
  await expect
    .poll(() => dialog.getByText("Este precio cambió mientras lo mirabas").query())
    .toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .poll(() => vi.mocked(props.setPrice).mock.lastCall?.[1])
    .toEqual({ unitPrice: 800000, expectedCurrentPriceId: "00000000-0000-4000-8000-000000000009" });

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));
  await expect
    .poll(() => vi.mocked(props.confirmPrice).mock.lastCall)
    .toEqual(["product-2", { expectedCurrentPriceId: "00000000-0000-4000-8000-000000000009" }]);
});

test("the modal offers no confirm-without-change action for a product with no price", async () => {
  const props = createProps({ target: withoutPrice });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();

  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Confirmar sin cambios" }).query()).toBeNull();
});

test("a modal save that finds no open session ends the session", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "unauthenticated" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => vi.mocked(props.onSessionEnded).mock.calls.length).toBe(1);
});

test.each([
  { daysSinceReview: 0, pending: false, eyebrow: "Revisado hoy" },
  { daysSinceReview: 1, pending: false, eyebrow: "Revisado hace 1 día" },
  { daysSinceReview: 30, pending: true, eyebrow: "Sin revisar hace 30 días" },
])(
  "the modal states the review age the cloud reports: $eyebrow",
  async ({ daysSinceReview, pending, eyebrow }) => {
    const product: PriceProduct = { ...rice, daysSinceReview, pending };
    const screen = await renderModal(createProps({ target: product }));

    await expect.element(screen.getByRole("dialog").getByText(eyebrow)).toBeVisible();
  },
);

test("the modal shows a price the cloud reports as reviewed today as reviewed today", async () => {
  const product: PriceProduct = {
    ...rice,
    daysSinceReview: 0,
    pending: false,
  };
  const screen = await renderModal(createProps({ target: product }));
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Revisado hoy")).toBeVisible();
  expect(dialog.getByText("Sin revisar", { exact: false }).query()).toBeNull();
});

test("a save rejected for the price it expected is treated as a changed price and offers the reload", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({
    kind: "validation_failed",
    field: "expectedCurrentPriceId",
  });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
  expect(dialog.getByText("Revisá el precio.").query()).toBeNull();
});

test("a save rejected for an amount that passes every local check asks to review the price", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({ kind: "validation_failed", field: "unitPrice" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("Revisá el precio.")).toBeVisible();
});

test("a save rejected for a field the form does not have shows the save-failed notice", async () => {
  const props = createProps();
  vi.mocked(props.setPrice).mockResolvedValue({
    kind: "validation_failed",
    field: "something_new",
  });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("No se pudo guardar el precio")).toBeVisible();
  expect(dialog.getByText("Revisá el precio.").query()).toBeNull();
});

test("a confirmation answered that there is no price to confirm offers the reload", async () => {
  const props = createProps();
  vi.mocked(props.confirmPrice).mockResolvedValue({ kind: "no_price_to_confirm" });
  const screen = await renderModal(props);
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("No hay un precio para confirmar");
  expect(dialog.getByRole("alert").element().textContent).toBe("No hay un precio para confirmar");
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
});
