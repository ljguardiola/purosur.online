import type { BuyerIdentificationThreshold } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CloudData } from "../platform/use-cloud-query";
import { BuyerIdentificationThresholdSection } from "./buyer-identification-threshold-section";

const inEffect: BuyerIdentificationThreshold = {
  id: "threshold-1",
  amount: 1_000_000_000,
  validFrom: "2026-01-01",
};

const scheduled: BuyerIdentificationThreshold = {
  id: "threshold-2",
  amount: 1_500_000_000,
  validFrom: "2026-12-01",
};

const aDayOfOctober = () => new Date("2026-10-15T12:00:00-03:00");

function loaded(
  thresholds: BuyerIdentificationThreshold[],
): CloudData<BuyerIdentificationThreshold[]> {
  return { status: "loaded", value: thresholds, refreshing: false };
}

function sectionFor(
  data: CloudData<BuyerIdentificationThreshold[]>,
  options: { onRecord?: () => void; now?: () => Date } = {},
) {
  return (
    <main>
      <BuyerIdentificationThresholdSection
        data={data}
        onRecord={options.onRecord ?? (() => {})}
        now={options.now ?? aDayOfOctober}
      />
    </main>
  );
}

test("shows the threshold in effect today with the day it started, and what a sale at that amount means", async () => {
  const screen = await render(sectionFor(loaded([scheduled, inEffect])));

  await expect
    .element(
      screen.getByRole("heading", { name: "Umbral de identificación del comprador", level: 2 }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Vigente", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
  await expect.element(screen.getByText("01/01/2026")).toBeVisible();
  await expect
    .element(screen.getByText("Una venta de este importe o más no se puede cobrar en la caja."))
    .toBeVisible();
});

test("also shows the next threshold, with its own start, when one is scheduled after today", async () => {
  const screen = await render(sectionFor(loaded([scheduled, inEffect])));

  await expect.element(screen.getByText("Próximo")).toBeVisible();
  await expect.element(screen.getByText("$ 15.000.000,00")).toBeVisible();
  await expect.element(screen.getByText("01/12/2026")).toBeVisible();
});

test("shows no next threshold when none is scheduled", async () => {
  const screen = await render(sectionFor(loaded([inEffect])));

  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();
  expect(screen.getByText("Próximo").query()).toBeNull();
});

test("shows Sin cargar, and no start, when no threshold has been loaded", async () => {
  const screen = await render(sectionFor(loaded([])));

  await expect.element(screen.getByText("Sin cargar")).toBeVisible();
  expect(screen.getByText("Desde").query()).toBeNull();
  expect(screen.getByText("Próximo").query()).toBeNull();
});

test("shows Sin cargar for what is in effect while the only threshold starts later", async () => {
  const screen = await render(sectionFor(loaded([scheduled])));

  await expect.element(screen.getByText("Sin cargar")).toBeVisible();
  await expect.element(screen.getByText("Próximo")).toBeVisible();
  await expect.element(screen.getByText("$ 15.000.000,00")).toBeVisible();
});

test("counts today as Argentina's day, not the UTC one", async () => {
  const eveningBeforeDecemberInArgentina = () => new Date("2026-12-01T01:00:00Z");
  const screen = await render(
    sectionFor(loaded([scheduled, inEffect]), { now: eveningBeforeDecemberInArgentina }),
  );

  await expect.element(screen.getByText("Próximo")).toBeVisible();
  await expect.element(screen.getByText("$ 15.000.000,00")).toBeVisible();
});

test("reads the day again when the thresholds change", async () => {
  let current = new Date("2026-10-15T12:00:00-03:00");
  const screen = await render(sectionFor(loaded([scheduled, inEffect]), { now: () => current }));
  await expect.element(screen.getByText("Próximo")).toBeVisible();

  current = new Date("2026-12-02T12:00:00-03:00");
  await screen.rerender(
    sectionFor(loaded([scheduled, inEffect, { ...inEffect, id: "other" }]), {
      now: () => current,
    }),
  );

  await expect.element(screen.getByText("Próximo")).not.toBeInTheDocument();
  await expect.element(screen.getByText("$ 15.000.000,00")).toBeVisible();
});

test("shows a placeholder while loading, with the action disabled", async () => {
  const screen = await render(sectionFor({ status: "loading" }));

  await expect.element(screen.getByText("Cargando…")).toHaveTextContent("Cargando…");
  await expect
    .element(screen.getByRole("button", { name: "Cargar un umbral nuevo" }))
    .toBeDisabled();
  expect(screen.getByText("Sin cargar").query()).toBeNull();
});

test("shows a load failure with Reintentar, and the action disabled", async () => {
  const retry = vi.fn();
  const screen = await render(sectionFor({ status: "failed", retry }));

  await expect
    .element(screen.getByText("No pudimos abrir el umbral de identificación del comprador"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cargar un umbral nuevo" }))
    .toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice with the time to wait", async () => {
  const screen = await render(
    sectionFor({ status: "failed", retry: vi.fn(), retryAfterSeconds: 120 }),
  );

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("keeps the action available while loaded data refreshes", async () => {
  const onRecord = vi.fn();
  const screen = await render(
    sectionFor({ status: "loaded", value: [inEffect], refreshing: true }, { onRecord }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Cargar un umbral nuevo" }));

  expect(onRecord).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations once loaded", async () => {
  const screen = await render(sectionFor(loaded([scheduled, inEffect])));
  await expect.element(screen.getByText("$ 10.000.000,00")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
