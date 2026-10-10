import type { DeactivatePackagingModalServices } from "./deactivate-packaging-modal";
import type { EditPackagingModalServices } from "./edit-packaging-modal";
import type { NewPackagingModalServices } from "./new-packaging-modal";
import {
  createPackaging,
  deactivatePackaging,
  editPackaging,
  fetchPackagings,
  reactivatePackaging,
} from "./packagings-api";
import type { ReactivatePackagingModalServices } from "./reactivate-packaging-modal";

export type PackagingsListScreenServices = {
  fetchPackagings: typeof fetchPackagings;
} & NewPackagingModalServices &
  EditPackagingModalServices &
  DeactivatePackagingModalServices &
  ReactivatePackagingModalServices;

export const defaultPackagingsListScreenServices: PackagingsListScreenServices = {
  fetchPackagings,
  createPackaging,
  editPackaging,
  deactivatePackaging,
  reactivatePackaging,
};
