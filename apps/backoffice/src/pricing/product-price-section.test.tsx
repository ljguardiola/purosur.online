import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  almendrasComponent,
  almendrasId,
  marginOf,
  mixProductId,
  pasasId,
  recommended16000,
  renderSection,
  sectionServices,
} from "./test-support/product-price-section";

test("is titled after the product the price belongs to", async () => {
  const screen = await renderSection({ productDescription: "Mix de frutos secos" });

  await expect
    .element(screen.getByRole("heading", { name: "Precio de venta de Mix de frutos secos" }))
    .toBeVisible();
});

test("shows a loading placeholder until the recommendation is read", async () => {
  const services = sectionServices();
  services.fetchPriceRecommendation.mockReturnValue(new Promise(() => {}));
  const screen = await renderSection({ services });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByText("Precio actual")).not.toBeInTheDocument();
});

test("asks for the recommendation of the components the recipe has right now", async () => {
  const services = sectionServices();
  await renderSection({ services });

  await vi.waitFor(() =>
    expect(services.fetchPriceRecommendation).toHaveBeenCalledWith(mixProductId, {
      components: [
        { componentProductId: almendrasId, quantityPerOutputUnit: 600 },
        { componentProductId: pasasId, quantityPerOutputUnit: 400 },
      ],
    }),
  );
});

test("shows the current price beside the recommended one, per kilo, and the unit cost of the latest batch", async () => {
  const screen = await renderSection();

  await expect.element(screen.getByText("Precio actual")).toBeVisible();
  await expect.element(screen.getByText("$ 15.000,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("Precio recomendado")).toBeVisible();
  await expect.element(screen.getByText("$ 16.000,00 / kg", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Costo de la última tanda")).toBeVisible();
  await expect.element(screen.getByText("$ 12.000,00 / kg")).toBeVisible();
});

test("shows a product without a price as having none", async () => {
  const services = sectionServices({ ...recommended16000, currentPrice: null });
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("Sin precio")).toBeVisible();
});

test("prefills the price field with the recommendation", async () => {
  const screen = await renderSection();

  await expect.element(screen.getByLabelText("Precio de venta por kilo")).toHaveValue("16.000,00");
});

test("labels the price field per unit for a product sold by unit", async () => {
  const screen = await renderSection({ saleUnit: "UNIT" });

  await expect.element(screen.getByLabelText("Precio de venta por unidad")).toBeVisible();
});

test("shows a 25 % margin for a $ 16.000 price over a $ 12.000 cost, asking for the margin of that price", async () => {
  const services = sectionServices();
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("Margen con este precio")).toBeVisible();
  await expect.element(screen.getByText("25 %")).toBeVisible();
  await vi.waitFor(() =>
    expect(services.fetchPriceRecommendation).toHaveBeenCalledWith(
      mixProductId,
      expect.objectContaining({ unitPrice: 1600000 }),
    ),
  );
});

test("names the components without a price and recommends nothing", async () => {
  const services = sectionServices({
    ...recommended16000,
    recommendation: { kind: "missing_prices", componentProductIds: [pasasId] },
  });
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("Sin recomendación")).toBeVisible();
  await expect
    .element(screen.getByText("Estos componentes no tienen precio: Pasas."))
    .toBeVisible();
  await expect.element(screen.getByLabelText("Precio de venta por kilo")).toHaveValue("");
});

test("shows no margin and says there is no batch yet", async () => {
  const services = sectionServices({ ...recommended16000, batchCost: { kind: "none" } });
  const screen = await renderSection({ services });

  await expect
    .element(
      screen.getByText("Todavía no hay tandas de este producto: no se puede calcular el margen."),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Margen con este precio")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Sin tandas")).toBeVisible();
});

test("shows no margin and says the latest batch's cost is incomplete", async () => {
  const services = sectionServices({ ...recommended16000, batchCost: { kind: "incomplete" } });
  const screen = await renderSection({ services });

  await expect
    .element(
      screen.getByText(
        "El costo de la última tanda está incompleto: no se puede calcular el margen.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Margen con este precio")).not.toBeInTheDocument();
  expect(services.fetchPriceRecommendation).toHaveBeenCalledTimes(1);
});

test("shows everything but offers no field and no save button without permission to set prices", async () => {
  const services = sectionServices();
  const screen = await renderSection({ services, maySetPrice: false });

  await expect.element(screen.getByText("$ 16.000,00 / kg", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("25 %")).toBeVisible();
  await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Guardar el precio" }))
    .not.toBeInTheDocument();
  expect(services.fetchPriceRecommendation).toHaveBeenCalledWith(
    mixProductId,
    expect.objectContaining({ unitPrice: 1600000 }),
  );
});

test("shows a failure to read with a retry that reads again", async () => {
  const services = sectionServices();
  services.fetchPriceRecommendation.mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("No pudimos abrir el precio de venta")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("$ 15.000,00 / kg")).toBeVisible();
});

test("a refused session ends the session", async () => {
  const onSessionEnded = vi.fn();
  const services = sectionServices();
  services.fetchPriceRecommendation.mockResolvedValue({ kind: "unauthenticated" });
  await renderSection({ services, onSessionEnded });

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});

test("shows a rate limit with when to try again", async () => {
  const services = sectionServices();
  services.fetchPriceRecommendation.mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows no margin for a product whose margin cannot be computed", async () => {
  const services = sectionServices(marginOf(null));
  services.fetchPriceRecommendation.mockResolvedValue({ kind: "ok", value: marginOf(null) });
  const screen = await renderSection({ services });

  await expect.element(screen.getByText("Margen con este precio")).toBeVisible();
  await expect.element(screen.getByText("—")).toBeVisible();
});

describe("while the person edits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("asks for the margin of the typed price only once it has settled", async () => {
    const services = sectionServices();
    const screen = await renderSection({ services });
    await vi.advanceTimersByTimeAsync(1_000);
    services.fetchPriceRecommendation.mockClear();

    await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "17000");
    await vi.advanceTimersByTimeAsync(299);
    expect(services.fetchPriceRecommendation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() =>
      expect(services.fetchPriceRecommendation).toHaveBeenCalledExactlyOnceWith(
        mixProductId,
        expect.objectContaining({ unitPrice: 1700000 }),
      ),
    );
    await expect.element(screen.getByText("29,4 %")).toBeVisible();
  });

  test("asks again, once the components settle, for the recommendation of the edited components", async () => {
    const services = sectionServices();
    const screen = await renderSection({ services });
    await vi.advanceTimersByTimeAsync(1_000);
    services.fetchPriceRecommendation.mockClear();

    await screen.withComponents([{ ...almendrasComponent, quantityPerOutputUnit: 700 }]);
    await vi.advanceTimersByTimeAsync(299);
    expect(services.fetchPriceRecommendation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() =>
      expect(services.fetchPriceRecommendation).toHaveBeenCalledWith(mixProductId, {
        components: [{ componentProductId: almendrasId, quantityPerOutputUnit: 700 }],
      }),
    );
  });

  test("keeps what the person typed when the recommendation changes", async () => {
    const services = sectionServices();
    const screen = await renderSection({ services });
    await vi.advanceTimersByTimeAsync(1_000);
    await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "17000");
    services.fetchPriceRecommendation.mockResolvedValue({
      kind: "ok",
      value: { ...recommended16000, recommendation: { kind: "recommended", unitPrice: 1800000 } },
    });

    await screen.withComponents([{ ...almendrasComponent, quantityPerOutputUnit: 700 }]);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect.element(screen.getByText("$ 18.000,00 / kg", { exact: true })).toBeVisible();
    await expect.element(screen.getByLabelText("Precio de venta por kilo")).toHaveValue("17000");
  });

  test("follows the recommendation while the person has not typed a price", async () => {
    const services = sectionServices();
    const screen = await renderSection({ services });
    await vi.advanceTimersByTimeAsync(1_000);
    services.fetchPriceRecommendation.mockResolvedValue({
      kind: "ok",
      value: { ...recommended16000, recommendation: { kind: "recommended", unitPrice: 1800000 } },
    });

    await screen.withComponents([{ ...almendrasComponent, quantityPerOutputUnit: 700 }]);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect
      .element(screen.getByLabelText("Precio de venta por kilo"))
      .toHaveValue("18.000,00");
  });
});
