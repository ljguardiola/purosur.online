import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPriceListAiCost } from "./supplier-price-list-ai-cost";
import {
  EARLY_LIST_AI_COST,
  INCOMPLETE_LIST_AI_COST,
  LIST_AI_COST,
  SINGLE_UNPRICED_LIST_AI_COST,
} from "./test-support/ai-cost";

const LIST_ID = "list-1";

function renderCost(
  fetchSupplierPriceListAiCost = vi.fn().mockResolvedValue({ kind: "ok", value: LIST_AI_COST }),
  onSessionEnded = () => {},
) {
  return render(
    <SupplierPriceListAiCost
      listId={LIST_ID}
      services={{ fetchSupplierPriceListAiCost }}
      onSessionEnded={onSessionEnded}
    />,
  );
}

function answering(value: typeof LIST_AI_COST) {
  return vi.fn().mockResolvedValue({ kind: "ok", value });
}

test("shows what reading the list cost, what its link proposals cost and their sum", async () => {
  const fetchSupplierPriceListAiCost = answering(LIST_AI_COST);

  const screen = await renderCost(fetchSupplierPriceListAiCost);

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText(/^LecturaUS\$ 1,2346$/)).toBeVisible();
  await expect.element(screen.getByText(/^Propuestas de vínculoUS\$ 0,2500$/)).toBeVisible();
  await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();
  expect(fetchSupplierPriceListAiCost).toHaveBeenCalledWith(LIST_ID);
  expect(screen.getByText(/anterior al registro de costos/).query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("marks a cost as incomplete when some call's model had no price", async () => {
  const screen = await renderCost(answering(INCOMPLETE_LIST_AI_COST));

  await expect
    .element(
      screen.getByText(/^Propuestas de vínculoIncompleto: 2 llamadas sin precioUS\$ 0,2500$/),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText(/^TotalIncompleto: 2 llamadas sin precioUS\$ 1,4846$/))
    .toBeVisible();
  expect(screen.getByText(/^LecturaIncompleto/).query()).toBeNull();
});

test("speaks of a single call without a price in the singular", async () => {
  const screen = await renderCost(answering(SINGLE_UNPRICED_LIST_AI_COST));

  await expect
    .element(screen.getByText(/^LecturaIncompleto: 1 llamada sin precioUS\$ 0,0000$/))
    .toBeVisible();
});

test("says the cost is incomplete when the list's AI use began before costs were recorded", async () => {
  const screen = await renderCost(answering(EARLY_LIST_AI_COST));

  await expect
    .element(
      screen.getByText(
        "Incompleto: parte del uso de IA de esta lista es anterior al registro de costos",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText(/^TotalUS\$ 0,2500$/)).toBeVisible();
});

test("shows placeholders in place of the figures while the cost loads", async () => {
  const screen = await renderCost(vi.fn().mockReturnValue(new Promise(() => {})));

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA", level: 2 }))
    .toBeVisible();
  expect(screen.getByText(/US\$/).query()).toBeNull();
});

test("shows a failed load of the cost with a retry that reads it again", async () => {
  const fetchSupplierPriceListAiCost = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: LIST_AI_COST });
  const screen = await renderCost(fetchSupplierPriceListAiCost);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();
  expect(fetchSupplierPriceListAiCost).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const onSessionEnded = vi.fn();

  await renderCost(vi.fn().mockResolvedValue({ kind: "unauthenticated" }), onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
