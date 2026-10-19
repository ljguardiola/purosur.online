import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { CompromiseResponseStepCard } from "./compromise-response-step-card";

function renderCard(state: { done: boolean; doneAt: string | null; available: boolean }) {
  return render(
    <main>
      <CompromiseResponseStepCard
        number={2}
        title="Un paso de prueba"
        description="Lo que hace el paso."
        state={state}
      >
        <button type="button">Hacer el paso</button>
      </CompromiseResponseStepCard>
    </main>,
  );
}

test("shows the step's number, title, explanation and content", async () => {
  const screen = await renderCard({ done: false, doneAt: null, available: true });

  await expect.element(screen.getByRole("heading", { name: "Un paso de prueba" })).toBeVisible();
  await expect.element(screen.getByText("Paso 2")).toBeVisible();
  await expect.element(screen.getByText("Lo que hace el paso.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Hacer el paso" })).toBeVisible();
});

test("marks an available step as available", async () => {
  const screen = await renderCard({ done: false, doneAt: null, available: true });

  await expect.element(screen.getByText("Disponible")).toBeVisible();
});

test("marks a step that is neither done nor available as blocked until the previous one is done", async () => {
  const screen = await renderCard({ done: false, doneAt: null, available: false });

  await expect
    .element(screen.getByText("Bloqueado hasta completar el anterior"))
    .toBeVisible();
});

test("marks a done step with the day and time it was done", async () => {
  const screen = await renderCard({
    done: true,
    doneAt: "2026-10-01T15:30:00.000Z",
    available: false,
  });

  await expect.element(screen.getByText("Hecho el 01/10/2026 · 15:30")).toBeVisible();
});

test("has no accessibility violations", async () => {
  const screen = await renderCard({ done: false, doneAt: null, available: true });

  await expectNoAccessibilityViolations(screen.container);
});
