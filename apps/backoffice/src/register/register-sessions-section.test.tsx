import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import type { RegisterSessionsSectionServices } from "./register-sessions-section";
import { RegisterSessionsSection } from "./register-sessions-section";
import {
  emptyCashSessionClosesReport,
  weekCashSessionClosesReport,
} from "./test-support/cash-session-closes-fixtures";

function renderSection(
  read: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
    kind: "ok",
    value: weekCashSessionClosesReport,
  }),
  onSessionEnded: () => void = () => {},
) {
  const services: RegisterSessionsSectionServices = { fetchCashSessionCloses: read };
  return render(
    <RegisterSessionsSection
      registerId={FRONT_REGISTER_ID}
      onSessionEnded={onSessionEnded}
      services={services}
    />,
  ).then((screen) => ({ screen, read }));
}

test("reads the closes of the register it is given over the default period", async () => {
  const { read } = await renderSection();

  await expect.poll(() => read.mock.calls).toEqual([[{ register_id: FRONT_REGISTER_ID }]]);
});

test("shows each close's date, cashier and cash, with no column naming the register", async () => {
  const { screen } = await renderSection();

  for (const name of ["Fecha", "Cajero", "Esperado", "Contado", "Diferencia"]) {
    await expect.element(screen.getByRole("columnheader", { name })).toBeVisible();
  }
  expect(screen.getByRole("columnheader", { name: "Caja" }).query()).toBeNull();
  await expect.element(screen.getByText("Tomás Ruiz").first()).toBeVisible();
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
});

test("links to Cierres de caja narrowed to that register", async () => {
  const { screen } = await renderSection();

  await expect
    .element(screen.getByRole("link", { name: "Ver en Cierres de caja" }))
    .toHaveAttribute("href", `/registers/closes?register=${FRONT_REGISTER_ID}`);
});

test("shows loading placeholders while the closes load", async () => {
  const { screen } = await renderSection(vi.fn().mockReturnValue(new Promise(() => {})));

  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
});

test("says the register has no closed sessions in the period", async () => {
  const { screen } = await renderSection(
    vi.fn().mockResolvedValue({ kind: "ok", value: emptyCashSessionClosesReport }),
  );

  await expect.element(screen.getByText("No hay sesiones cerradas en este período")).toBeVisible();
});

test("shows a load error whose retry reads again", async () => {
  const read = vi.fn().mockResolvedValueOnce({ kind: "failed" });
  read.mockResolvedValue({ kind: "ok", value: weekCashSessionClosesReport });
  const { screen } = await renderSection(read);
  await expect.element(screen.getByText("No pudimos abrir los cierres de sesión")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
});

test("ends the session when the read finds no open session", async () => {
  const onSessionEnded = vi.fn();
  await renderSection(vi.fn().mockResolvedValue({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded", async () => {
  const { screen } = await renderSection();
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
