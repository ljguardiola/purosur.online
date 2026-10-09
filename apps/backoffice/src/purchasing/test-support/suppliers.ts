import type { SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";

export const andina: SupplierSummary = {
  id: "5a900000-0000-4000-8000-000000000001",
  name: "Distribuidora Andina",
  cuit: FICTIONAL_CUIT,
  contact: "Marta Pérez · 11 5555-0100",
  note: "Entrega los martes",
  active: true,
  version: 1,
};
export const granos: SupplierSummary = {
  id: "5a900000-0000-4000-8000-000000000002",
  name: "Granos del Valle",
  cuit: null,
  contact: null,
  note: null,
  active: true,
  version: 2,
};
export const cerealera: SupplierSummary = {
  id: "5a900000-0000-4000-8000-000000000003",
  name: "Cerealera del Norte",
  cuit: ANOTHER_FICTIONAL_CUIT,
  contact: "ventas@cerealera.example",
  note: null,
  active: false,
  version: 4,
};
