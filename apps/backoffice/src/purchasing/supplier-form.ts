import {
  type SupplierCreationBody,
  type SupplierEditBody,
  type SupplierSummary,
  supplierCreationBodySchema,
} from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";

const {
  name: nameSchema,
  contact: contactSchema,
  note: noteSchema,
} = supplierCreationBodySchema.shape;

export type SupplierFormValues = {
  name: string;
  cuit: string;
  contact: string;
  note: string;
  version: number;
};

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: "",
  cuit: "",
  contact: "",
  note: "",
  version: 1,
};

export const SUPPLIER_FIELDS = {
  name: "name",
  cuit: "cuit",
  contact: "contact",
  note: "note",
  version: null,
} as const;

export const SUPPLIER_NAME_TAKEN = "Ya existe un proveedor con ese nombre.";
export const SUPPLIER_CUIT_TAKEN = "Ya existe un proveedor con ese CUIT.";

export function supplierNameMessage({ name }: SupplierFormValues): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del proveedor.";
  }
  if (!nameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre del proveedor.";
}

export function supplierCuitMessage(_values: SupplierFormValues): string {
  return "Ingresá un CUIT válido, con el formato NN-NNNNNNNN-N.";
}

export function supplierContactMessage({ contact }: SupplierFormValues): string {
  return contactSchema.safeParse(contact.trim()).success
    ? "Revisá el contacto."
    : `El contacto puede tener hasta ${schemaLimit(contactSchema.meta()?.["maxLength"])} caracteres.`;
}

export function supplierNoteMessage({ note }: SupplierFormValues): string {
  return noteSchema.safeParse(note.trim()).success
    ? "Revisá la nota."
    : `La nota puede tener hasta ${schemaLimit(noteSchema.meta()?.["maxLength"])} caracteres.`;
}

export const SUPPLIER_FIELD_MESSAGES = {
  name: supplierNameMessage,
  cuit: supplierCuitMessage,
  contact: supplierContactMessage,
  note: supplierNoteMessage,
};

export function supplierCreationRequestFrom({
  name,
  cuit,
  contact,
  note,
}: SupplierFormValues): SupplierCreationBody {
  return { name: name.trim(), cuit: cuit.trim(), contact: contact.trim(), note: note.trim() };
}

export function supplierEditRequestFrom(values: SupplierFormValues): SupplierEditBody {
  return { ...supplierCreationRequestFrom(values), version: values.version };
}

export function supplierFormValuesOf(supplier: SupplierSummary): SupplierFormValues {
  return {
    name: supplier.name,
    cuit: supplier.cuit ?? "",
    contact: supplier.contact ?? "",
    note: supplier.note ?? "",
    version: supplier.version,
  };
}
