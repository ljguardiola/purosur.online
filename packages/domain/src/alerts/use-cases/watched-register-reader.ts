import type { WatchedRegister } from "../../register/index.js";

export interface WatchedRegisterReader {
  watchedRegisters(): Promise<WatchedRegister[]>;
}
