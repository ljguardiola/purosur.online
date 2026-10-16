import type { EndEverySessionModalServices } from "./end-every-session-modal";
import { endEverySession } from "./session-api";

export type EndEverySessionSectionServices = EndEverySessionModalServices;

export const defaultEndEverySessionSectionServices: EndEverySessionSectionServices = {
  endEverySession,
};
