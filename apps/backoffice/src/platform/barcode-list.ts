import {
  type InternalBarcodeGenerationBody,
  internalBarcodeGenerationBodySchema,
  productCreationBodySchema,
} from "@purosur/contracts";
import type { NewProductBarcodeListProblem } from "@purosur/domain";
import { plural } from "@purosur/ui";
import type { ZodType } from "zod";
import { failedRules } from "./failed-rules";
import { schemaLimit } from "./schema-limit";

export type BarcodeListValue = { codes: string[]; scan: string };

const barcodesSchema = productCreationBodySchema.shape.barcodes;

export function barcodesWithScan({ codes, scan }: BarcodeListValue): string[] {
  const pending = scan.trim();
  return pending === "" ? codes : [...codes, pending];
}

const BARCODE_PROBLEM_MESSAGES = new Map<string, string>(
  Object.entries({
    too_many: `El producto puede tener hasta ${schemaLimit(barcodesSchema.meta()?.["maxCount"])} códigos de barras.`,
    too_long: `El código de barras puede tener hasta ${schemaLimit(barcodesSchema.meta()?.["maxLength"])} caracteres.`,
    whitespace: "El código de barras no puede tener espacios.",
    repeated: "Ese código ya está en la lista.",
    several_internal: "El producto puede tener un solo código interno.",
    internal_beside_others: "El código interno tiene que ser el único del producto.",
  } satisfies Record<NewProductBarcodeListProblem, string>),
);

export function barcodeProblemMessageOf(schema: ZodType, codes: string[]): string | undefined {
  const [problem] = failedRules(schema, codes);
  return problem === undefined ? undefined : BARCODE_PROBLEM_MESSAGES.get(problem);
}

export function barcodeProblemMessage(codes: string[]): string | undefined {
  return barcodeProblemMessageOf(barcodesSchema, codes);
}

export function internalBarcodeGenerationRequestFrom(
  codes: string[],
): InternalBarcodeGenerationBody | undefined {
  return internalBarcodeGenerationBodySchema.safeParse({ barcodes: codes }).data;
}

const PRODUCT_BARCODE_TAKEN_UNNAMED = "Alguno de los códigos ya es de otro producto.";

function barcodeTakenText(params: { codes: string[] }): string {
  const list = params.codes.join(", ");
  return plural(params.codes.length, {
    one: `El código ${list} ya es de otro producto.`,
    other: `Los códigos ${list} ya son de otro producto.`,
  });
}

export function barcodeTakenError(codes: string[]): string {
  return codes.length > 0 ? barcodeTakenText({ codes }) : PRODUCT_BARCODE_TAKEN_UNNAMED;
}
