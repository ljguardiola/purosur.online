import type { SupplierItemLinkProposal } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  LinkSupplierItemModal,
  type LinkSupplierItemModalServices,
} from "./link-supplier-item-modal";
import {
  LINK_CHOICES,
  NO_PROPOSAL,
  PROPOSED_BY_AI,
  PROPOSED_MIEL_WITH_UNITS,
  PROPOSED_PASAS_WITH_KILOS,
  UNAVAILABLE_PROPOSAL,
} from "./test-support/supplier-item-links";
import { EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const nutRow = EXTRACTED_ROWS[2] as (typeof EXTRACTED_ROWS)[number];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Answer = Awaited<ReturnType<LinkSupplierItemModalServices["fetchSupplierItemLinkProposal"]>>;

function answering(...answers: Answer[]): LinkSupplierItemModalServices {
  const fetchProposal = vi.fn<LinkSupplierItemModalServices["fetchSupplierItemLinkProposal"]>();
  for (const answer of answers) {
    fetchProposal.mockResolvedValueOnce(answer);
  }
  return {
    linkSupplierPriceListRow: vi.fn<LinkSupplierItemModalServices["linkSupplierPriceListRow"]>(),
    fetchSupplierItemLinkProposal: fetchProposal,
    fetchSupplierItemLinkChoices: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValue({ kind: "ok", value: LINK_CHOICES }),
  };
}

const proposal = (value: SupplierItemLinkProposal): Answer => ({ kind: "ok", value });

async function opened(services: LinkSupplierItemModalServices) {
  const onSessionEnded = vi.fn();
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <LinkSupplierItemModal
          list={LIST}
          target={nutRow}
          remembersOnConfirm
          onCreateProduct={null}
          services={services}
          onLinked={() => {}}
          onOutdated={() => {}}
          onClose={() => {}}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog");
  return { screen, dialog, onSessionEnded };
}

type Dialog = Awaited<ReturnType<typeof opened>>["dialog"];

const askAgain = (dialog: Dialog) => dialog.getByRole("button", { name: "Volver a proponer" });
const productField = (dialog: Dialog) =>
  dialog.getByRole("combobox", { name: /^Producto del catálogo/ });
const quantityField = (dialog: Dialog) =>
  dialog.getByRole("textbox", { name: /^Cantidad que trae/ });

test("reads the proposal without asking the model again", async () => {
  const services = answering(proposal(PROPOSED_BY_AI));
  await opened(services);

  await expect
    .poll(() => services.fetchSupplierItemLinkProposal)
    .toHaveBeenCalledWith(LIST.id, nutRow.id, { refresh: false });
});

test.each([
  ["a proposed product", proposal(PROPOSED_BY_AI)],
  ["no proposal", proposal(NO_PROPOSAL)],
  ["an unavailable proposal", proposal(UNAVAILABLE_PROPOSAL)],
])("offers to propose again once %s is loaded", async (_kind, answer) => {
  const { dialog } = await opened(answering(answer));

  await expect.element(askAgain(dialog)).toBeEnabled();
});

test("offers no new proposal while the proposal loads", async () => {
  const { dialog } = await opened({
    ...answering(),
    fetchSupplierItemLinkProposal: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  await expect.element(productField(dialog)).toBeVisible();
  expect(askAgain(dialog).query()).toBeNull();
});

test("asks the model again when the person asks for a new proposal, and shows the new one", async () => {
  const services = answering(proposal(PROPOSED_BY_AI), proposal(PROPOSED_MIEL_WITH_UNITS));
  const { dialog } = await opened(services);
  await expect.element(productField(dialog)).toHaveValue("Pasas de uva");

  await userEvent.click(askAgain(dialog));

  expect(services.fetchSupplierItemLinkProposal).toHaveBeenLastCalledWith(LIST.id, nutRow.id, {
    refresh: true,
  });
  await expect
    .element(dialog.getByText("Propuesto por código de barras: Miel pura de abeja 1 kg").first())
    .toBeVisible();
});

test("chooses the new product and its quantity when the person kept the one proposed before", async () => {
  const { dialog } = await opened(
    answering(proposal(PROPOSED_PASAS_WITH_KILOS), proposal(PROPOSED_MIEL_WITH_UNITS)),
  );
  await expect.element(quantityField(dialog)).toHaveValue("12,5");

  await userEvent.click(askAgain(dialog));

  await expect.element(productField(dialog)).toHaveValue("Miel pura de abeja 1 kg");
  await expect.element(quantityField(dialog)).toHaveValue("36");
});

test("clears the quantity the person typed, as choosing another product does, when the new proposal changes the product", async () => {
  const { dialog } = await opened(
    answering(proposal(PROPOSED_PASAS_WITH_KILOS), proposal(PROPOSED_MIEL_WITH_UNITS)),
  );
  await expect.element(quantityField(dialog)).toHaveValue("12,5");
  await userEvent.fill(quantityField(dialog), "7");

  await userEvent.click(askAgain(dialog));

  await expect.element(productField(dialog)).toHaveValue("Miel pura de abeja 1 kg");
  await expect.element(quantityField(dialog)).toHaveValue("");
});

test("leaves the product the person chose over the one proposed", async () => {
  const { screen, dialog } = await opened(
    answering(proposal(PROPOSED_BY_AI), proposal(PROPOSED_MIEL_WITH_UNITS)),
  );
  await expect.element(productField(dialog)).toHaveValue("Pasas de uva");
  await userEvent.fill(productField(dialog), "Almendras");
  await expect.element(screen.getByRole("option", { name: "Almendras peladas" })).toBeVisible();
  (screen.getByRole("option", { name: "Almendras peladas" }).element() as HTMLElement).click();

  await userEvent.click(askAgain(dialog));

  await expect
    .element(dialog.getByText("Propuesto por código de barras: Miel pura de abeja 1 kg").first())
    .toBeVisible();
  await expect.element(productField(dialog)).toHaveValue("Almendras peladas");
});

test.each([
  ["no proposal", proposal(NO_PROPOSAL)],
  ["an unavailable proposal", proposal(UNAVAILABLE_PROPOSAL)],
])("clears the product proposed before when the new answer is %s", async (_kind, answer) => {
  const { dialog } = await opened(answering(proposal(PROPOSED_BY_AI), answer));
  await expect.element(productField(dialog)).toHaveValue("Pasas de uva");

  await userEvent.click(askAgain(dialog));

  await expect.element(productField(dialog)).toHaveValue("");
});

test("disables the action while the new proposal is being asked", async () => {
  let settle: (answer: Answer) => void = () => {};
  const services = answering(proposal(PROPOSED_BY_AI));
  vi.mocked(services.fetchSupplierItemLinkProposal).mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  const { dialog } = await opened(services);
  await expect.element(askAgain(dialog)).toBeEnabled();

  await userEvent.click(askAgain(dialog));
  await expect.element(askAgain(dialog)).toBeDisabled();

  settle(proposal(NO_PROPOSAL));
  await expect.element(askAgain(dialog)).toBeEnabled();
});

test.each([
  ["failed", { kind: "failed" }],
  ["rate_limited", { kind: "rate_limited", retryAfterSeconds: 30 }],
] as const)(
  "shows that asking again did not work (%s) and keeps the proposal",
  async (_kind, outcome) => {
    const { dialog } = await opened(answering(proposal(PROPOSED_BY_AI), outcome));
    await expect.element(productField(dialog)).toHaveValue("Pasas de uva");

    await userEvent.click(askAgain(dialog));

    await expect.element(dialog.getByText("No pudimos volver a proponer")).toBeVisible();
    await expect.element(dialog.getByText("Propuesto por IA: Pasas de uva").first()).toBeVisible();
    await expect.element(productField(dialog)).toHaveValue("Pasas de uva");
  },
);

test("ends the session when asking again finds it ended", async () => {
  const { dialog, onSessionEnded } = await opened(
    answering(proposal(PROPOSED_BY_AI), { kind: "unauthenticated" }),
  );

  await userEvent.click(askAgain(dialog));

  await expect.poll(() => onSessionEnded).toHaveBeenCalledTimes(1);
});
