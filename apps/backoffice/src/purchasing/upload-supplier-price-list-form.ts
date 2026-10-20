import { z } from "zod";

export type UploadFormValues = { supplierId: string | null; file: File | null };

export const EMPTY_UPLOAD_FORM: UploadFormValues = { supplierId: null, file: null };

export const uploadRequestSchema = z.object({
  supplierId: z.string().min(1),
  file: z
    .instanceof(File)
    .nullable()
    .refine((file): file is File => file !== null),
});

export const UPLOAD_FIELDS = {
  supplierId: "supplierId",
  file: "file",
  fileName: "file",
} as const;

export function uploadRequestFrom({ supplierId, file }: UploadFormValues) {
  return { supplierId: supplierId ?? "", file };
}

export const UPLOAD_FIELD_MESSAGES = {
  supplierId: "Elegí el proveedor.",
  file: "Elegí el archivo PDF de la lista.",
};
