import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ComponentProps } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CompromiseResponseChecklist } from "./compromise-response-checklist";
import { runbook } from "./test-support/compromise-response";

const secrets = runbook([], ["claude_api_key"]).items.filter(
  (item) => item.step === "rotate_external_secrets",
);
const notify = runbook().items.filter((item) => item.step === "notify");

function renderChecklist(props: Partial<ComponentProps<typeof CompromiseResponseChecklist>> = {}) {
  return render(
    <main>
      <CompromiseResponseChecklist
        items={secrets}
        enabled
        pendingItem={null}
        onMark={() => {}}
        {...props}
      />
    </main>,
  );
}

test("lists every external secret by its name", async () => {
  const screen = await renderChecklist();

  for (const label of [
    "Secreto del webhook de Mercado Pago",
    "Token del webhook de WhatsApp",
    "Secreto del webhook de WhatsApp",
    "Clave de la API de Claude",
    "Credenciales de Postgres",
    "Credenciales de despliegue de CI",
    "Credenciales del bucket",
    "Certificado y clave privada de ARCA, si pudieron quedar expuestos",
  ]) {
    await expect.element(screen.getByText(label)).toBeVisible();
  }
});

test("says renewing ARCA's certificate does not interrupt emission while the current one is valid", async () => {
  const screen = await renderChecklist();

  await expect
    .element(screen.getByText(/no corta la emisión mientras el certificado actual siga vigente/))
    .toBeVisible();
});

test("names the notification item", async () => {
  const screen = await renderChecklist({ items: notify });

  await expect
    .element(screen.getByText("Avisé y di la instrucción operativa al personal del local"))
    .toBeVisible();
});

test("offers to mark each pending item and shows the done one with its day and time", async () => {
  const screen = await renderChecklist();

  await expect.element(screen.getByText("Hecho el 01/10/2026 · 15:30")).toBeVisible();
  expect(screen.getByRole("button", { name: "Marcar como hecho" }).elements()).toHaveLength(7);
});

test("reports the item whose button is pressed", async () => {
  const onMark = vi.fn();
  const screen = await renderChecklist({ onMark });

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Credenciales de Postgres" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  expect(onMark).toHaveBeenCalledWith("postgres_credentials");
});

test("disables every button while its step is not available", async () => {
  const screen = await renderChecklist({ enabled: false });

  for (const button of screen.getByRole("button", { name: "Marcar como hecho" }).elements()) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
  }
});

test("disables every button while an item is being marked", async () => {
  const screen = await renderChecklist({ pendingItem: "claude_api_key" });

  for (const button of screen.getByRole("button", { name: "Marcar como hecho" }).elements()) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
  }
});

test("has no accessibility violations", async () => {
  const screen = await renderChecklist();

  await expectNoAccessibilityViolations(screen.container);
});
