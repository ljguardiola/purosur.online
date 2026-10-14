import type { FreightBody, LinkablePurchaseList } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import {
  FreightFields,
  type FreightNotice,
  FreightNotices,
  useFreightRequestForm,
} from "./freight-fields";
import { fillFreight, toggle } from "./test-support/freight-form-fill";
import { compraAndina, compraMolinos, linkablePurchases } from "./test-support/freights";

const LOADED: CloudData<LinkablePurchaseList> = {
  status: "loaded",
  value: linkablePurchases,
  refreshing: false,
};

function Harness({
  purchases = LOADED,
  onSubmit = () => Promise.resolve(),
}: {
  purchases?: CloudData<LinkablePurchaseList>;
  onSubmit?: (request: FreightBody) => Promise<void>;
}) {
  const { form, submit } = useFreightRequestForm((request) => onSubmit(request));
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightFields form={form} purchases={purchases} />
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </main>
    </FieldSizeProvider>
  );
}

test("shows the fields and each purchase that may be linked with its day, receipt and value", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("group", { name: /^Fecha/ })).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Monto/ })).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Medio/ })).toBeVisible();
  await expect
    .element(screen.getByRole("checkbox", { name: "Viaje propio (costo estimado)" }))
    .not.toBeChecked();
  await expect.element(screen.getByRole("textbox", { name: /^Descripción/ })).toBeVisible();
  await expect.element(screen.getByText("Compras vinculadas")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "No cambia costos ni precios. Se reparte entre las líneas de estas compras y se muestra por unidad al decidir un precio.",
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("12/09/2026 · Factura B 0003-00012845 · $ 168.680,00"))
    .toBeVisible();
  await expect
    .element(screen.getByText("28/08/2026 · Remito 0001-00008812 · $ 64.900,00"))
    .toBeVisible();
});

test("shows the loading placeholder while the purchases load", async () => {
  const screen = await render(<Harness purchases={{ status: "loading" }} />);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("checkbox", { name: "Distribuidora Andina" }).query()).toBeNull();
});

test("offers to read the purchases again when they could not be loaded", async () => {
  const retry = vi.fn();
  const screen = await render(<Harness purchases={{ status: "failed", retry }} />);

  await expect.element(screen.getByText("No pudimos abrir las compras")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledTimes(1);
});

test("says there is nothing to link when the period holds no purchase", async () => {
  const screen = await render(
    <Harness
      purchases={{
        status: "loaded",
        value: { ...linkablePurchases, purchases: [] },
        refreshing: false,
      }}
    />,
  );

  await expect.element(screen.getByText("No hay compras para vincular")).toBeVisible();
  await expect
    .element(screen.getByText("Aparecen las compras registradas en el período elegido."))
    .toBeVisible();
});

test("builds the request from the typed values and the purchases left chosen", async () => {
  const onSubmit = vi.fn<(request: FreightBody) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<Harness onSubmit={onSubmit} />);

  await fillFreight(screen.locator, {
    date: "12092026",
    amount: "18.500,00",
    carrierName: "Expreso Sur",
    description: "Envío desde Buenos Aires",
    suppliers: ["Distribuidora Andina", "Molinos del Valle"],
  });
  await toggle(screen.locator, "Distribuidora Andina");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect
    .poll(() => onSubmit.mock.calls)
    .toEqual([
      [
        {
          date: "2026-09-12",
          amountCents: 1_850_000,
          description: "Envío desde Buenos Aires",
          means: { kind: "carrier", name: "Expreso Sur" },
          purchaseIds: [compraMolinos.id],
        },
      ],
    ]);
});

test("disables the carrier on the store's own trip and asks for none", async () => {
  const onSubmit = vi.fn<(request: FreightBody) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<Harness onSubmit={onSubmit} />);

  await fillFreight(screen.locator, {
    date: "28082026",
    amount: "9000",
    ownTrip: true,
    description: "Retiro en el molino",
    suppliers: ["Distribuidora Andina"],
  });
  await expect.element(screen.getByRole("textbox", { name: /^Medio/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect
    .poll(() => onSubmit.mock.calls)
    .toEqual([
      [
        {
          date: "2026-08-28",
          amountCents: 900_000,
          description: "Retiro en el molino",
          means: { kind: "own_trip" },
          purchaseIds: [compraAndina.id],
        },
      ],
    ]);
});

test("refuses an empty form under each field without submitting it", async () => {
  const onSubmit = vi.fn<(request: FreightBody) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<Harness onSubmit={onSubmit} />);

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Ingresá la fecha del flete.")).toBeVisible();
  await expect
    .element(screen.getByText("Escribí el monto con coma para los centavos, por ejemplo 1.250,50."))
    .toBeVisible();
  await expect.element(screen.getByText("Ingresá el medio del flete.")).toBeVisible();
  await expect.element(screen.getByText("Ingresá la descripción del flete.")).toBeVisible();
  await expect.element(screen.getByText("Elegí al menos una compra.")).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await render(<Harness />);
  await expect
    .element(screen.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

const notices: [FreightNotice, string, string][] = [
  [{ kind: "attemptFailed" }, "No se guardó el flete", "Volvé a intentarlo."],
  [
    { kind: "rateLimited", retryAfterSeconds: 60 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 1 minuto.",
  ],
  [
    { kind: "purchasesWithoutValue" },
    "Las compras vinculadas no tienen valor",
    "Elegí otras compras para repartir el flete.",
  ],
];

test.each(notices)("words the notice %j", async (notice, title, description) => {
  const screen = await render(
    <FreightNotices notice={notice} failedTitle="No se guardó el flete" />,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent(`${title} ${description}`);
});

test("says the freight no longer exists", async () => {
  const screen = await render(
    <FreightNotices notice={{ kind: "notFound" }} failedTitle="No se guardó el flete" />,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent("Este flete ya no existe");
});

test("shows no notice when there is none", async () => {
  const screen = await render(<FreightNotices notice={null} failedTitle="No se guardó el flete" />);

  expect(screen.container.textContent).toBe("");
});
