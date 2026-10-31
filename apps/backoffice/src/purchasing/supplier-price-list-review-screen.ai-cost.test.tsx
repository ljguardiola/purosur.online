import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { LIST_AI_COST } from "./test-support/ai-cost";
import {
  LINK_CHOICES,
  NO_PROPOSAL,
  PROPOSED_QUANTITY_OF_UNITS,
} from "./test-support/supplier-item-links";
import {
  createServices,
  LIST_ID,
  loaded,
  renderScreen,
} from "./test-support/supplier-price-list-review-screen";
import {
  EVERY_REVIEW_ACTION,
  EXTRACTED_ROWS,
  READ_LIST,
  READING_LIST,
  reviewOf,
} from "./test-support/supplier-price-lists";

const WITH_AI_COST = accessWith("supplier_price_lists", "branch_area");
const WITHOUT_AI_COST = accessWith("supplier_price_lists");
const review = reviewOf(READ_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function servicesReading() {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost).mockResolvedValue({
    kind: "ok",
    value: LIST_AI_COST,
  });
  return services;
}

test("shows the list's AI cost to who may change the branch's settings", async () => {
  const services = servicesReading();

  const screen = await loaded(services, review, { access: WITH_AI_COST });

  await expect
    .element(screen.getByRole("heading", { name: "Costo de IA", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();
  expect(services.fetchSupplierPriceListAiCost).toHaveBeenCalledWith(LIST_ID);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows no cost and asks the cloud for none without the permission to change the branch's settings", async () => {
  const services = servicesReading();

  const screen = await loaded(services, review, { access: WITHOUT_AI_COST });

  expect(screen.getByText("Costo de IA").query()).toBeNull();
  expect(screen.getByText(/US\$/).query()).toBeNull();
  expect(services.fetchSupplierPriceListAiCost).not.toHaveBeenCalled();
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
  await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );

  await expect.element(screen.getByText(/^TotalUS\$ 1,9846$/)).toBeVisible();
});

test("reads the cost again after the AI proposed the quantity of the item a product is created from, so the cost shown stays current", async () => {
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
  vi.mocked(services.fetchSupplierItemQuantityProposal).mockResolvedValue({
    kind: "ok",
    value: PROPOSED_QUANTITY_OF_UNITS,
  });
  const screen = await loaded(services, review, { access: WITH_AI_COST });
  await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
  );

  await expect.element(screen.getByText(/^TotalUS\$ 1,9846$/)).toBeVisible();
});

test("shows a failed load of the cost leaving the items in view", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListAiCost).mockResolvedValue({ kind: "failed" });

  const screen = await loaded(services, review, { access: WITH_AI_COST });

  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Ítems de la lista" })).toBeVisible();
});

test("reads the cost again when the list's reading ends, so the cost shown includes it", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { kind: "found", review: reviewOf({ ...READING_LIST, id: LIST_ID }, []) },
    })
    .mockResolvedValue({ kind: "ok", value: { kind: "found", review } });
  vi.mocked(services.fetchSupplierPriceListAiCost)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        reading: { costNanoUsd: 0, unpricedCalls: 0 },
        proposals: { costNanoUsd: 0, unpricedCalls: 0 },
        total: { costNanoUsd: 0, unpricedCalls: 0 },
        recordedFromStart: true,
      },
    })
    .mockResolvedValue({ kind: "ok", value: LIST_AI_COST });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services, { access: WITH_AI_COST });
    await expect.element(screen.getByText(/^TotalUS\$ 0,0000$/)).toBeVisible();

    vi.advanceTimersByTime(5_000);

    await expect.element(screen.getByRole("table", { name: "Ítems de la lista" })).toBeVisible();
    await expect.element(screen.getByText(/^TotalUS\$ 1,4846$/)).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});
