import { type AssemblyBatchBody, assemblyBatchBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AssemblyBatchComponentsField } from "./assembly-batch-components-field";
import {
  ASSEMBLY_BATCH_FIELDS,
  type AssemblyBatchFormValues,
  type AssemblyBatchProposal,
  assemblyBatchBodyOf,
  batchUsedMessage,
  EMPTY_ASSEMBLY_BATCH_FORM,
} from "./assembly-batch-form";
import { mixPreview } from "./test-support/assembly-batches";
import { almendras, mixDeFrutosSecos, nueces } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const recipe = mixDeFrutosSecos;

type HarnessProps = {
  proposal: AssemblyBatchProposal | undefined;
  refusals: Record<string, string>;
  onUsedChange: () => void;
  onRequest: (request: AssemblyBatchBody) => void;
};

function Harness({ proposal, refusals, onUsedChange, onRequest }: HarnessProps) {
  const { form, submit } = useRequestForm({
    defaultValues: {
      ...EMPTY_ASSEMBLY_BATCH_FORM,
      productId: recipe.productId,
      size: "5",
    } satisfies AssemblyBatchFormValues,
    request: {
      schema: assemblyBatchBodySchema,
      from: (values) => assemblyBatchBodyOf(values, { recipe, proposal }),
    },
    fields: ASSEMBLY_BATCH_FIELDS,
    messages: {
      productId: "Elegí el producto armado.",
      size: "Revisá el tamaño.",
      used: (values) => batchUsedMessage(values, recipe, proposal),
      output: "Revisá lo obtenido.",
    },
    onSubmit: async (request) => onRequest(request),
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="used">
          {() => (
            <AssemblyBatchComponentsField
              components={recipe.components}
              proposal={proposal}
              refusals={refusals}
              onUsedChange={onUsedChange}
            />
          )}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </main>
    </FieldSizeProvider>
  );
}

function renderField(options: Partial<HarnessProps> = {}) {
  const proposal = "proposal" in options ? options.proposal : mixPreview.proposal;
  const { refusals = {}, onUsedChange = () => {}, onRequest = () => {} } = options;
  return render(
    <Harness
      proposal={proposal}
      refusals={refusals}
      onUsedChange={onUsedChange}
      onRequest={onRequest}
    />,
  );
}

test("lists each component with the quantity the recipe proposes and the same quantity as used", async () => {
  const screen = await renderField();

  const rows = screen.getByRole("row").all();
  expect(rows.map((row) => row.element().textContent)).toEqual([
    "ComponenteRecetaUsado",
    "Almendras2,000 kgUsado de Almendraskg",
    "Nueces1,500 kgUsado de Nueceskg",
    "Maní1,000 kgUsado de Maníkg",
    "Pasas0,500 kgUsado de Pasaskg",
  ]);
  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Almendras" }))
    .toHaveValue("2,000");
  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Pasas" }))
    .toHaveValue("0,500");
});

test("shows no proposed quantity and no used quantity while the proposal is missing", async () => {
  const screen = await renderField({ proposal: undefined });

  await expect.element(screen.getByRole("textbox", { name: "Usado de Almendras" })).toHaveValue("");
  expect(screen.getByRole("row").nth(1).element().textContent).toBe(
    "Almendras—Usado de Almendraskg",
  );
});

test("keeps what was typed as used and the proposal for the other components", async () => {
  const onRequest = vi.fn();
  const onUsedChange = vi.fn();
  const screen = await renderField({ onRequest, onUsedChange });

  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "1,4");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onRequest.mock.calls.length).toBe(1);
  expect(onUsedChange).toHaveBeenCalled();
  expect(onRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      used: expect.arrayContaining([
        { componentProductId: nueces.id, quantity: 1_400 },
        { componentProductId: almendras.id, quantity: 2_000 },
      ]),
    }),
  );
});

test("shows the message of the first used quantity that cannot be read", async () => {
  const onRequest = vi.fn();
  const screen = await renderField({ onRequest });

  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Nueces: ingresá la cantidad usada.")).toBeVisible();
  expect(onRequest).not.toHaveBeenCalled();
});

test("shows the refusal of a component next to its quantity", async () => {
  const screen = await renderField({ refusals: { [almendras.id]: "Cantidad no válida." } });

  await expect.element(screen.getByText("Cantidad no válida.")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Usado de Almendras" })).toBeInvalid();
});
