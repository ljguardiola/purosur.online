import type { SupplierItemQuantityProposal } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CreateProductFromSupplierItemModalServices } from "./create-product-from-supplier-item-modal";
import {
  createServices,
  LIST,
  modalElement,
  nutRow,
  renderModal,
} from "./test-support/create-product-from-supplier-item-modal";
import {
  NO_QUANTITY_PROPOSAL,
  PROPOSED_QUANTITY_OF_UNITS,
  UNAVAILABLE_QUANTITY_PROPOSAL,
} from "./test-support/supplier-item-links";

const PROPOSED_ANOTHER_QUANTITY: SupplierItemQuantityProposal = {
  kind: "proposed",
  quantity: 24_000,
};

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

type Fetch = CreateProductFromSupplierItemModalServices["fetchSupplierItemQuantityProposal"];
type Answer = Awaited<ReturnType<Fetch>>;

const proposal = (value: SupplierItemQuantityProposal): Answer => ({ kind: "ok", value });

function answering(...answers: Answer[]): CreateProductFromSupplierItemModalServices {
  const fetchProposal = vi.fn<Fetch>();
  for (const answer of answers) {
    fetchProposal.mockResolvedValueOnce(answer);
  }
  return createServices({ fetchSupplierItemQuantityProposal: fetchProposal });
}

const dialogName = "Crear producto desde la lista";

async function opened(services: CreateProductFromSupplierItemModalServices) {
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });
  const dialog = screen.getByRole("dialog", { name: dialogName });
  await expect.element(dialog.getByRole("combobox", { name: /^Categoría/ })).toBeVisible();
  return { screen, dialog, onSessionEnded };
}

type Dialog = Awaited<ReturnType<typeof opened>>["dialog"];

const askAgain = (dialog: Dialog) => dialog.getByRole("button", { name: "Volver a proponer" });
const quantityField = (dialog: Dialog) =>
  dialog.getByRole("textbox", { name: /^Cantidad que trae/ });

test.each([
  ["a quantity", proposal(PROPOSED_QUANTITY_OF_UNITS)],
  ["no quantity", proposal(NO_QUANTITY_PROPOSAL)],
  ["an unavailable proposal", proposal(UNAVAILABLE_QUANTITY_PROPOSAL)],
])("offers to propose the quantity again once %s is loaded", async (_kind, answer) => {
  const { dialog } = await opened(answering(answer));

  await expect.element(askAgain(dialog)).toBeEnabled();
});

test("keeps the action in place, disabled, while the quantity proposal loads", async () => {
  const { dialog } = await opened(
    createServices({
      fetchSupplierItemQuantityProposal: vi.fn<Fetch>().mockReturnValue(new Promise(() => {})),
    }),
  );

  await expect.element(askAgain(dialog)).toBeDisabled();
});

test("keeps the action in place, disabled, once reading the quantity proposal failed", async () => {
  const { dialog } = await opened(answering({ kind: "failed" }));

  await expect.element(askAgain(dialog)).toBeDisabled();
});

test("asks the model again for the shape of the product and fills the new quantity the person did not touch", async () => {
  const services = answering(
    proposal(PROPOSED_QUANTITY_OF_UNITS),
    proposal(PROPOSED_ANOTHER_QUANTITY),
  );
  const { dialog } = await opened(services);
  await expect.element(quantityField(dialog)).toHaveValue("36");

  await userEvent.click(askAgain(dialog));

  expect(services.fetchSupplierItemQuantityProposal).toHaveBeenLastCalledWith(LIST.id, nutRow.id, {
    saleUnit: "UNIT",
    netContent: null,
    refresh: true,
  });
  await expect.element(quantityField(dialog)).toHaveValue("24");
});

test("keeps the quantity the person typed when the new proposal arrives", async () => {
  const services = answering(
    proposal(PROPOSED_QUANTITY_OF_UNITS),
    proposal(PROPOSED_ANOTHER_QUANTITY),
  );
  const { dialog } = await opened(services);
  await expect.element(quantityField(dialog)).toHaveValue("36");
  await userEvent.fill(quantityField(dialog), "7");

  await userEvent.click(askAgain(dialog));

  await expect
    .poll(() => vi.mocked(services.fetchSupplierItemQuantityProposal).mock.calls.length)
    .toBe(2);
  await expect.element(quantityField(dialog)).toHaveValue("7");
});

test("disables the action while the new quantity is being asked", async () => {
  let settle: (answer: Answer) => void = () => {};
  const services = answering(proposal(PROPOSED_QUANTITY_OF_UNITS));
  vi.mocked(services.fetchSupplierItemQuantityProposal).mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  const { dialog } = await opened(services);
  await expect.element(askAgain(dialog)).toBeEnabled();

  await userEvent.click(askAgain(dialog));
  await expect.element(askAgain(dialog)).toBeDisabled();

  settle(proposal(PROPOSED_ANOTHER_QUANTITY));
  await expect.element(askAgain(dialog)).toBeEnabled();
});

test("shows that asking again did not work and keeps the quantity", async () => {
  const { dialog } = await opened(
    answering(proposal(PROPOSED_QUANTITY_OF_UNITS), { kind: "failed" }),
  );
  await expect.element(quantityField(dialog)).toHaveValue("36");

  await userEvent.click(askAgain(dialog));

  await expect.element(dialog.getByText("No pudimos volver a proponer").first()).toBeVisible();
  await expect.element(quantityField(dialog)).toHaveValue("36");
});

test("ends the session when asking again finds it ended", async () => {
  const { dialog, onSessionEnded } = await opened(
    answering(proposal(PROPOSED_QUANTITY_OF_UNITS), { kind: "unauthenticated" }),
  );

  await userEvent.click(askAgain(dialog));

  await expect.poll(() => onSessionEnded).toHaveBeenCalledTimes(1);
});

test("a new opening of the item does not tell that asking again failed before", async () => {
  const services = answering(
    proposal(PROPOSED_QUANTITY_OF_UNITS),
    { kind: "failed" },
    proposal(PROPOSED_QUANTITY_OF_UNITS),
  );
  const { screen, dialog } = await opened(services);
  await userEvent.click(askAgain(dialog));
  await expect.element(dialog.getByText("No pudimos volver a proponer").first()).toBeVisible();

  await screen.rerender(modalElement({ services, target: null }));
  await screen.rerender(modalElement({ services, target: { ...nutRow } }));

  const reopened = screen.getByRole("dialog", { name: dialogName });
  await expect.element(askAgain(reopened)).toBeEnabled();
  expect(reopened.getByText("No pudimos volver a proponer").elements()).toEqual([]);
});
