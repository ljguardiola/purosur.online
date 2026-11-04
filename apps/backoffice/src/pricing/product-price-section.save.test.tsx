import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  currentPrice,
  mixProductId,
  recommended16000,
  renderSection,
  sectionServices,
} from "./test-support/product-price-section";

async function saveTyped(screen: Awaited<ReturnType<typeof renderSection>>, amount: string) {
  const field = screen.getByLabelText("Precio de venta por kilo");
  await expect.element(field).toHaveValue("16.000,00");
  await userEvent.fill(field, amount);
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio" }));
}

test("saves the typed price with the id of the price it saw", async () => {
  const services = sectionServices();
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await vi.waitFor(() =>
    expect(services.setPrice).toHaveBeenCalledExactlyOnceWith(mixProductId, {
      unitPrice: 1700000,
      expectedCurrentPriceId: currentPrice.id,
    }),
  );
});

test("saves the recommendation as it came when the person did not change it", async () => {
  const services = sectionServices();
  const screen = await renderSection({ services });
  await expect.element(screen.getByLabelText("Precio de venta por kilo")).toHaveValue("16.000,00");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio" }));

  await vi.waitFor(() =>
    expect(services.setPrice).toHaveBeenCalledExactlyOnceWith(mixProductId, {
      unitPrice: 1600000,
      expectedCurrentPriceId: currentPrice.id,
    }),
  );
});

test("expects no price when the product has none", async () => {
  const services = sectionServices({ ...recommended16000, currentPrice: null });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await vi.waitFor(() =>
    expect(services.setPrice).toHaveBeenCalledExactlyOnceWith(mixProductId, {
      unitPrice: 1700000,
      expectedCurrentPriceId: null,
    }),
  );
});

test("announces the saved price", async () => {
  const screen = await renderSection();
  await saveTyped(screen, "17000");

  await expect.element(screen.getByText("Precio guardado")).toBeVisible();
  await expect
    .element(screen.getByText("Mix de frutos secos pasa a $ 17.000,00 / kg."))
    .toBeVisible();
});

test("expects the new price after a save, which read again", async () => {
  const services = sectionServices();
  const savedPrice = {
    ...currentPrice,
    id: "00000000-0000-4000-8000-000000000002",
    unitPrice: 1700000,
  };
  services.setPrice.mockImplementation(async () => {
    services.fetchPriceRecommendation.mockResolvedValue({
      kind: "ok",
      value: { ...recommended16000, currentPrice: savedPrice },
    });
    return { kind: "ok" };
  });
  const screen = await renderSection({ services });
  await saveTyped(screen, "17000");
  await expect.element(screen.getByText("$ 17.000,00 / kg", { exact: true })).toBeVisible();

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "18000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio" }));

  await vi.waitFor(() =>
    expect(services.setPrice).toHaveBeenLastCalledWith(mixProductId, {
      unitPrice: 1800000,
      expectedCurrentPriceId: savedPrice.id,
    }),
  );
});

test("asks to type a price instead of saving an empty or malformed one", async () => {
  const services = sectionServices();
  const screen = await renderSection({ services });
  await saveTyped(screen, "");

  await expect.element(screen.getByText("Ingresá el precio nuevo.")).toBeVisible();
  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "1,");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio" }));

  expect(services.setPrice).not.toHaveBeenCalled();
});

test("shows the current price as the unchanged price on the field", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "price_unchanged" });
  const screen = await renderSection({ services });

  await saveTyped(screen, "15000");

  await expect.element(screen.getByText("Es el precio actual.")).toBeVisible();
});

test("shows a field the cloud refuses on the price field", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "validation_failed", field: "unitPrice" });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await expect.element(screen.getByText("Revisá el precio.")).toBeVisible();
});

test("a price that changed meanwhile offers in its notice to reload the current price, which reads it again", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "stale_price" });
  const screen = await renderSection({ services });
  await saveTyped(screen, "17000");
  await expect.element(screen.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
  services.fetchPriceRecommendation.mockResolvedValue({
    kind: "ok",
    value: { ...recommended16000, currentPrice: { ...currentPrice, unitPrice: 1650000 } },
  });

  const reload = screen.getByRole("button", { name: "Recargar el precio actual" });
  expect(screen.getByRole("alert").element().parentElement?.contains(reload.element())).toBe(true);
  await userEvent.click(reload);

  await expect.element(screen.getByText("$ 16.500,00 / kg", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("Este precio cambió mientras lo mirabas"))
    .not.toBeInTheDocument();
});

test("a cloud rejection of the price it expected is treated as a changed price", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({
    kind: "validation_failed",
    field: "expectedCurrentPriceId",
  });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await expect.element(screen.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
});

test("a product that is no longer there is announced", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "not_found" });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await expect.element(screen.getByRole("alert")).toHaveTextContent("Producto desactivado");
});

test("a save that finds no open session ends the session", async () => {
  const onSessionEnded = vi.fn();
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "unauthenticated" });
  const screen = await renderSection({ services, onSessionEnded });

  await saveTyped(screen, "17000");

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1));
});

test("a save the person may not make sends them to their account", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "forbidden" });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await vi.waitFor(() => expect(window.location.pathname).toBe("/account"));
});

test("a rate-limited save says when to try again", async () => {
  const services = sectionServices();
  services.setPrice.mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test.each([
  [
    "answers failed",
    (setPrice: ReturnType<typeof sectionServices>["setPrice"]) =>
      setPrice.mockResolvedValue({ kind: "failed" }),
  ],
  [
    "rejects",
    (setPrice: ReturnType<typeof sectionServices>["setPrice"]) =>
      setPrice.mockRejectedValue(new TypeError("offline")),
  ],
])("a save that %s says the price could not be saved", async (_name, setUp) => {
  const services = sectionServices();
  setUp(services.setPrice);
  const screen = await renderSection({ services });

  await saveTyped(screen, "17000");

  await expect.element(screen.getByText("No se pudo guardar el precio")).toBeVisible();
});
