import {
  supplierPriceListUploadQuerySchema,
  supplierPriceListWebPageAddressSchema,
  supplierPriceListWebPageBodySchema,
} from "@purosur/contracts";
import { z } from "zod";

export type UploadSource = "PDF" | "WEB_PAGE";

export type UploadFormValues = {
  supplierId: string | null;
  source: UploadSource;
  file: File | null;
  url: string;
};

export const EMPTY_UPLOAD_FORM: UploadFormValues = {
  supplierId: null,
  source: "PDF",
  file: null,
  url: "",
};

export const UPLOAD_FIELDS = {
  supplierId: "supplierId",
  source: null,
  fileName: "file",
  url: "url",
} as const;

export const uploadRequestSchema = z.discriminatedUnion("source", [
  supplierPriceListUploadQuerySchema.extend({ source: z.literal("PDF") }),
  supplierPriceListWebPageBodySchema.extend({ source: z.literal("WEB_PAGE") }),
]);

export function uploadRequestFrom({ supplierId, source, file, url }: UploadFormValues) {
  return source === "PDF"
    ? { source, supplierId: supplierId ?? "", fileName: file?.name ?? "" }
    : { source, supplierId: supplierId ?? "", url };
}

function addressMessage(url: string): string {
  if (url.trim() === "") {
    return "Escribí la dirección de la página.";
  }
  if (!supplierPriceListWebPageAddressSchema.safeParse(url).success) {
    return "Escribí la dirección completa de la página, empezando con http:// o https://.";
  }
  return supplierPriceListWebPageBodySchema.shape.url.safeParse(url).success
    ? "Revisá la dirección."
    : "La dirección es demasiado larga.";
}

export const UPLOAD_FIELD_MESSAGES = {
  supplierId: "Elegí el proveedor.",
  file: ({ file }: UploadFormValues) =>
    file === null
      ? "Elegí el archivo PDF de la lista."
      : "El nombre del archivo es demasiado largo.",
  url: ({ url }: UploadFormValues) => addressMessage(url),
};
