import { assemblyBatchBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_BATCH_FIELDS,
  assemblyBatchBodyOf,
  batchOutputMessage,
  batchProposalOf,
  batchSizeMessage,
  batchUsedMessage,
  EMPTY_ASSEMBLY_BATCH_FORM,
  lotPreviewRequestOf,
  outputText,
  proposalRequestOf,
  usedText,
} from "./assembly-batch-form";
import { mixPreview } from "./test-support/assembly-batches";
import { almendras, mixDeFrutosSecos, nueces } from "./test-support/recipes";

const proposal = mixPreview.proposal;
const recipe = mixDeFrutosSecos;
const [almendrasComponent, nuecesComponent] = recipe.components;
if (!almendrasComponent || !nuecesComponent) {
  throw new Error("The fixture recipe lacks components");
}

const chosen = { ...EMPTY_ASSEMBLY_BATCH_FORM, productId: recipe.productId, size: "5" };

describe("usedText", () => {
  it("shows the proposed quantity in the component's unit until the person types one", () => {
    expect(usedText(chosen, almendrasComponent, proposal)).toBe("2,000");
  });

  it("keeps what the person typed over the proposal", () => {
    const typed = { ...chosen, used: { [almendras.id]: "1,9" } };

    expect(usedText(typed, almendrasComponent, proposal)).toBe("1,9");
    expect(usedText(typed, nuecesComponent, proposal)).toBe("1,500");
  });

  it("is empty when there is no proposal yet", () => {
    expect(usedText(chosen, almendrasComponent, undefined)).toBe("");
  });

  it("is empty for a component the proposal does not carry", () => {
    expect(usedText(chosen, { ...almendrasComponent, componentProductId: "other" }, proposal)).toBe(
      "",
    );
  });
});

describe("outputText", () => {
  it("shows the proposed output until the person types one", () => {
    expect(outputText(chosen, "KG", proposal)).toBe("4,950");
    expect(outputText({ ...chosen, output: "4,8" }, "KG", proposal)).toBe("4,8");
  });

  it("keeps a typed empty output instead of the proposal", () => {
    expect(outputText({ ...chosen, output: "" }, "KG", proposal)).toBe("");
  });

  it("is empty when the proposal has no output", () => {
    expect(outputText(chosen, "KG", { ...proposal, output: null })).toBe("");
    expect(outputText(chosen, "KG", undefined)).toBe("");
  });
});

describe("proposalRequestOf", () => {
  it("asks for the proposal of the typed size", () => {
    expect(proposalRequestOf(chosen, recipe)).toEqual({ productId: recipe.productId, size: 5_000 });
  });

  it.each([[""], ["0"], ["abc"], ["1,2345"], ["2.147.484"]])(
    "asks for nothing with the size %j",
    (size) => {
      expect(proposalRequestOf({ ...chosen, size }, recipe)).toBeUndefined();
    },
  );

  it("asks for nothing without a recipe", () => {
    expect(proposalRequestOf(chosen, undefined)).toBeUndefined();
  });
});

describe("lotPreviewRequestOf", () => {
  it("asks for the cost of what is used and obtained, typed or proposed", () => {
    const typed = { ...chosen, used: { [almendras.id]: "1,9" }, output: "4,8" };

    expect(lotPreviewRequestOf(typed, { recipe, proposal })).toEqual({
      productId: recipe.productId,
      size: 5_000,
      used: [
        { componentProductId: almendras.id, quantity: 1_900 },
        { componentProductId: nueces.id, quantity: 1_500 },
        { componentProductId: recipe.components[2]?.componentProductId, quantity: 1_000 },
        { componentProductId: recipe.components[3]?.componentProductId, quantity: 500 },
      ],
      output: 4_800,
    });
  });

  it("leaves the output to the cloud's proposal until the person types one", () => {
    expect(lotPreviewRequestOf(chosen, { recipe, proposal })).toEqual({
      productId: recipe.productId,
      size: 5_000,
      used: [
        { componentProductId: almendras.id, quantity: 2_000 },
        { componentProductId: nueces.id, quantity: 1_500 },
        { componentProductId: recipe.components[2]?.componentProductId, quantity: 1_000 },
        { componentProductId: recipe.components[3]?.componentProductId, quantity: 500 },
      ],
    });
  });

  it.each([
    ["a used quantity that is not a number", { used: { [almendras.id]: "x" } }],
    ["a blank used quantity", { used: { [almendras.id]: "" } }],
    ["a used quantity above the largest one", { used: { [almendras.id]: "2.147.484" } }],
    ["an output of zero", { output: "0" }],
    ["a blank output", { output: "" }],
    ["an output above the largest one", { output: "2.147.484" }],
    ["an invalid size", { size: "" }],
  ])("asks for nothing with %s", (_name, change) => {
    expect(lotPreviewRequestOf({ ...chosen, ...change }, { recipe, proposal })).toBeUndefined();
  });

  it("asks for nothing without the proposal", () => {
    expect(lotPreviewRequestOf(chosen, { recipe, proposal: undefined })).toBeUndefined();
  });
});

describe("batchProposalOf", () => {
  const lotPreview = { ...mixPreview, proposal: { ...proposal, output: 4_900 } };

  it("proposes the output the cloud answered for what is used", () => {
    expect(batchProposalOf({ used: { [nueces.id]: "1,4" } }, proposal, lotPreview)).toEqual({
      used: proposal.used,
      output: 4_900,
    });
  });

  it("keeps the output proposed for the size while nothing used was edited", () => {
    expect(batchProposalOf({ used: {} }, proposal, undefined)).toEqual(proposal);
  });

  it("proposes no output while the cloud answers for an edited quantity", () => {
    expect(batchProposalOf({ used: { [nueces.id]: "1,4" } }, proposal, undefined)).toEqual({
      used: proposal.used,
      output: null,
    });
  });

  it("proposes nothing before the size is proposed", () => {
    expect(batchProposalOf({ used: {} }, undefined, lotPreview)).toBeUndefined();
  });
});

describe("assemblyBatchBodyOf", () => {
  it("builds a body the contract accepts from the proposal and what the person typed", () => {
    const body = assemblyBatchBodyOf(
      { ...chosen, used: { [nueces.id]: "1,4" } },
      { recipe, proposal },
    );

    expect(assemblyBatchBodySchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      productId: recipe.productId,
      recipeVersion: recipe.version,
      output: 4_950,
    });
    expect(body.used).toContainEqual({ componentProductId: nueces.id, quantity: 1_400 });
    expect(body.used).toContainEqual({ componentProductId: almendras.id, quantity: 2_000 });
  });

  it("builds a body the contract refuses while the proposal is missing", () => {
    expect(
      assemblyBatchBodySchema.safeParse(
        assemblyBatchBodyOf(chosen, { recipe, proposal: undefined }),
      ).success,
    ).toBe(false);
  });

  it("builds a body the contract refuses without a product", () => {
    expect(
      assemblyBatchBodySchema.safeParse(
        assemblyBatchBodyOf(EMPTY_ASSEMBLY_BATCH_FORM, { recipe: undefined, proposal: undefined }),
      ).success,
    ).toBe(false);
  });

  it("builds a body the contract refuses for an unreadable used quantity", () => {
    const body = assemblyBatchBodyOf(
      { ...chosen, used: { [nueces.id]: "mucho" } },
      { recipe, proposal },
    );

    expect(assemblyBatchBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("ASSEMBLY_BATCH_FIELDS", () => {
  it("lands a refused recipe version on the product before one is chosen and on the size after", () => {
    expect(ASSEMBLY_BATCH_FIELDS.recipeVersion(EMPTY_ASSEMBLY_BATCH_FORM)).toBe("productId");
    expect(ASSEMBLY_BATCH_FIELDS.recipeVersion(chosen)).toBe("size");
  });
});

describe("messages", () => {
  const KG_MESSAGE = "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.";

  it("asks for the size when it is blank and explains the format when it is unreadable", () => {
    expect(batchSizeMessage("", "KG", true)).toBe("Ingresá el tamaño de la tanda.");
    expect(batchSizeMessage("abc", "KG", true)).toBe(KG_MESSAGE);
  });

  it.each([
    ["0", "KG", "Ingresá un tamaño mayor a cero, de hasta 2.147.483,647 kg."],
    ["2.147.484", "KG", "Ingresá un tamaño mayor a cero, de hasta 2.147.483,647 kg."],
    ["2.147.484", "UNIT", "Ingresá un tamaño mayor a cero, de hasta 2.147.483 u."],
  ] as const)(
    "asks for a size from zero up to the largest one for %j in %s",
    (size, saleUnit, message) => {
      expect(batchSizeMessage(size, saleUnit, false)).toBe(message);
    },
  );

  it("asks to wait for the quantities while a readable size has no proposal yet", () => {
    expect(batchSizeMessage("5", "KG", false)).toBe(
      "Todavía no se calcularon las cantidades de la tanda. Probá de nuevo.",
    );
  });

  it("names the first component whose used quantity cannot be read", () => {
    expect(batchUsedMessage({ ...chosen, used: { [nueces.id]: "" } }, recipe, proposal)).toBe(
      "Nueces: ingresá la cantidad usada.",
    );
    expect(batchUsedMessage({ ...chosen, used: { [nueces.id]: "x" } }, recipe, proposal)).toBe(
      `Nueces: ${KG_MESSAGE.charAt(0).toLowerCase()}${KG_MESSAGE.slice(1)}`,
    );
  });

  it("asks to review what was used when every quantity reads but the request is refused", () => {
    expect(batchUsedMessage(chosen, recipe, proposal)).toBe("Revisá lo usado.");
  });

  it("asks for the output when it is blank and explains the format when it is unreadable", () => {
    expect(batchOutputMessage("", "KG")).toBe("Ingresá lo obtenido.");
    expect(batchOutputMessage("abc", "KG")).toBe(KG_MESSAGE);
  });

  it.each(["0", "2.147.484"])(
    "asks for an output from zero up to the largest one for %j",
    (output) => {
      expect(batchOutputMessage(output, "KG")).toBe(
        "Ingresá una cantidad obtenida mayor a cero, de hasta 2.147.483,647 kg.",
      );
    },
  );
});
