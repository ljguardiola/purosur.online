import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import {
  INCOMPLETE_LIST_AI_COST,
  LIST_AI_COST,
  SINGLE_UNPRICED_LIST_AI_COST,
} from "./test-support/ai-cost";
import { LINK_CHOICES, NO_PROPOSAL } from "./test-support/supplier-item-links";
import { createServices, LIST_ID, loaded } from "./test-support/supplier-price-list-review-screen";
import {
  EVERY_REVIEW_ACTION,
  EXTRACTED_ROWS,
  READ_LIST,
  reviewOf,
} from "./test-support/supplier-price-lists";

const WITH_AI_COST = accessWith("supplier_price_lists", "branch_area");
const WITHOUT_AI_COST = accessWith("supplier_price_lists");
const review = reviewOf(READ_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function servicesReading(cost = LIST_AI_COST) {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost).mockResolvedValue({ kind: "ok", value: cost });
  return services;
}

test("shows what reading the list cost, what its link proposals cost and their sum", async () => {
  const services = servicesReading();

  const screen = await loaded(services, review, { access: WITH_AI_COST });

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText(/^LecturaUS\$ 1\.234,5678$/)).toBeVisible();
  await expect.element(screen.getByText(/^Propuestas de vínculoUS\$ 0,2500$/)).toBeVisible();
  await expect.element(screen.getByText(/^TotalUS\$ 1\.484,5678$/)).toBeVisible();
  expect(services.fetchSupplierPriceListAiCost).toHaveBeenCalledWith(LIST_ID);
  await expectNoAccessibilityViolations(screen.container);
});

test("marks a cost as incomplete when some call's model had no price", async () => {
  const screen = await loaded(servicesReading(INCOMPLETE_LIST_AI_COST), review, {
    access: WITH_AI_COST,
  });

  await expect
    .element(
      screen.getByText(/^Propuestas de vínculoIncompleto: 2 llamadas sin precioUS\$ 0,2500$/),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText(/^TotalIncompleto: 2 llamadas sin precioUS\$ 1\.484,5678$/))
    .toBeVisible();
  expect(screen.getByText(/^LecturaIncompleto/).query()).toBeNull();
});

test("speaks of a single call without a price in the singular", async () => {
  const screen = await loaded(servicesReading(SINGLE_UNPRICED_LIST_AI_COST), review, {
    access: WITH_AI_COST,
  });

  await expect
    .element(screen.getByText(/^LecturaIncompleto: 1 llamada sin precioUS\$ 0,0000$/))
    .toBeVisible();
});

test("shows no cost and asks the cloud for none without the permission to change the branch's settings", async () => {
  const services = servicesReading();

  const screen = await loaded(services, review, { access: WITHOUT_AI_COST });

  expect(screen.getByText("Costo de IA").query()).toBeNull();
  expect(screen.getByText(/US\$/).query()).toBeNull();
  expect(services.fetchSupplierPriceListAiCost).not.toHaveBeenCalled();
});

test("shows placeholders in place of the figures while the cost loads", async () => {
  const services = createServices();

  const screen = await loaded(services, review, { access: WITH_AI_COST });

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA", level: 2 }))
    .toBeVisible();
  expect(screen.getByText(/US\$/).query()).toBeNull();
});

test("shows a failed load of the cost with a retry that reads it again, leaving the items in view", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: LIST_AI_COST });
  const screen = await loaded(services, review, { access: WITH_AI_COST });

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Ítems de la lista" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText(/^TotalUS\$ 1\.484,5678$/)).toBeVisible();
  expect(services.fetchSupplierPriceListAiCost).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await loaded(services, review, { access: WITH_AI_COST, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reads the cost again after the AI proposed a link, so the cost shown stays current", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost)
    .mockResolvedValueOnce({ kind: "ok", value: LIST_AI_COST })
    .mockResolvedValue({
      kind: "ok",
      value: {
        ...LIST_AI_COST,
        proposals: { costNanoUsd: 750_000_000, unpricedCalls: 0 },
        total: { costNanoUsd: 1_984_567_800, unpricedCalls: 0 },
      },
    });
  vi.mocked(services.fetchSupplierItemLinkProposal).mockResolvedValue({
    kind: "ok",
    value: NO_PROPOSAL,
  });
  vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
    kind: "ok",
    value: LINK_CHOICES,
  });
  const screen = await loaded(services, review, { access: WITH_AI_COST });
  await expect.element(screen.getByText(/^TotalUS\$ 1\.484,5678$/)).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );

  await expect.element(screen.getByText(/^TotalUS\$ 1\.984,5678$/)).toBeVisible();
});
