import { type AssemblyBatchBody, assemblyBatchBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ASSEMBLY_BATCH_FIELDS,
  type AssemblyBatchProposal,
  assemblyBatchBodyOf,
  batchOutputMessage,
  EMPTY_ASSEMBLY_BATCH_FORM,
  outputText,
} from "./assembly-batch-form";
import { AssemblyBatchOutputField } from "./assembly-batch-output-field";
import { mixPreview } from "./test-support/assembly-batches";
import { mixDeFrutosSecos } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const recipe = mixDeFrutosSecos;

type HarnessProps = {
  proposal: AssemblyBatchProposal | undefined;
  proposedText: string | undefined;
  refusal: string | undefined;
  onOutputChange: () => void;
  onRequest: (request: AssemblyBatchBody) => void;
};

function Harness({ proposal, proposedText, refusal, onOutputChange, onRequest }: HarnessProps) {
  const { form, values, submit } = useRequestForm({
    defaultValues: { ...EMPTY_ASSEMBLY_BATCH_FORM, productId: recipe.productId, size: "5" },
    request: {
      schema: assemblyBatchBodySchema,
      from: (formValues) => assemblyBatchBodyOf(formValues, { recipe, proposal }),
    },
    fields: ASSEMBLY_BATCH_FIELDS,
    messages: {
      productId: "Elegí el producto armado.",
      size: "Revisá el tamaño.",
      used: "Revisá lo usado.",
      output: (formValues) => batchOutputMessage(outputText(formValues, "KG", proposal), "KG"),
    },
    onSubmit: async (request) => onRequest(request),
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="output">
          {() => (
            <AssemblyBatchOutputField
              saleUnit="KG"
              shown={outputText(values, "KG", proposal)}
              proposedText={proposedText}
              refusal={refusal}
              onOutputChange={onOutputChange}
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
  const proposedText = "proposedText" in options ? options.proposedText : "4,950 kg";
  const { refusal, onOutputChange = () => {}, onRequest = () => {} } = options;
  return render(
    <Harness
      proposal={proposal}
      proposedText={proposedText}
      refusal={refusal}
      onOutputChange={onOutputChange}
      onRequest={onRequest}
    />,
  );
}

test("prefills the proposed output and explains where it comes from", async () => {
  const screen = await renderField();

  await expect.element(screen.getByRole("textbox", { name: /^Obtenido/ })).toHaveValue("4,950");
  await expect.element(screen.getByText("Propuesto: 4,950 kg, la suma de lo usado.")).toBeVisible();
});

test("shows no hint and no value when the recipe proposes no output", async () => {
  const screen = await renderField({
    proposal: { ...mixPreview.proposal, output: null },
    proposedText: undefined,
  });

  await expect.element(screen.getByRole("textbox", { name: /^Obtenido/ })).toHaveValue("");
  expect(screen.getByText(/Propuesto/).query()).toBeNull();
});

test("submits what the person typed instead of the proposal", async () => {
  const onRequest = vi.fn();
  const onOutputChange = vi.fn();
  const screen = await renderField({ onRequest, onOutputChange });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Obtenido/ }), "4,8");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onRequest.mock.calls.length).toBe(1);
  expect(onOutputChange).toHaveBeenCalled();
  expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ output: 4_800 }));
});

test("asks for the output when it was cleared", async () => {
  const onRequest = vi.fn();
  const screen = await renderField({ onRequest });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Obtenido/ }), "");
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(screen.getByText("Ingresá lo obtenido.")).toBeVisible();
  expect(onRequest).not.toHaveBeenCalled();
});

test("shows the refusal of the cloud next to the output", async () => {
  const screen = await renderField({ refusal: "No es válida." });

  await expect.element(screen.getByText("No es válida.")).toBeVisible();
});
