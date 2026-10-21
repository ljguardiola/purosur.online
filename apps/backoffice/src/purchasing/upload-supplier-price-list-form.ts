import type { SupplierPriceListUploadQuery } from "@purosur/contracts";

export type UploadFormValues = { supplierId: string | null; file: File | null };

export const EMPTY_UPLOAD_FORM: UploadFormValues = { supplierId: null, file: null };

export const UPLOAD_FIELDS = { supplierId: "supplierId", fileName: "file" } as const;

export function uploadRequestFrom({
  supplierId,
  file,
}: UploadFormValues): SupplierPriceListUploadQuery {
  return { supplierId: supplierId ?? "", fileName: file?.name ?? "" };
}

export const UPLOAD_FIELD_MESSAGES = {
  supplierId: "Elegí el proveedor.",
  file: ({ file }: UploadFormValues) =>
    file === null
      ? "Elegí el archivo PDF de la lista."
      : "El nombre del archivo es demasiado largo.",
};
