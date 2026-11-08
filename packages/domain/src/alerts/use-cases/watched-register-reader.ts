import type { WatchedRegister } from "../../installation/index.js";

export interface WatchedRegisterReader {
  watchedRegisters(): Promise<WatchedRegister[]>;
}
