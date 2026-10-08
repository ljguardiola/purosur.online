import { fetchRegisterSyncStatus } from "./registers-api";

export type RegistersSyncSectionServices = {
  fetchRegisterSyncStatus: typeof fetchRegisterSyncStatus;
};

export const defaultRegistersSyncSectionServices: RegistersSyncSectionServices = {
  fetchRegisterSyncStatus,
};
