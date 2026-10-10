import type { DeactivateSupplierModalServices } from "./deactivate-supplier-modal";
import type { EditSupplierModalServices } from "./edit-supplier-modal";
import type { NewSupplierModalServices } from "./new-supplier-modal";
import type { ReactivateSupplierModalServices } from "./reactivate-supplier-modal";
import {
  createSupplier,
  deactivateSupplier,
  editSupplier,
  fetchSuppliers,
  reactivateSupplier,
} from "./suppliers-api";

export type SuppliersListScreenServices = {
  fetchSuppliers: typeof fetchSuppliers;
} & NewSupplierModalServices &
  EditSupplierModalServices &
  DeactivateSupplierModalServices &
  ReactivateSupplierModalServices;

export const defaultSuppliersListScreenServices: SuppliersListScreenServices = {
  fetchSuppliers,
  createSupplier,
  editSupplier,
  deactivateSupplier,
  reactivateSupplier,
};
