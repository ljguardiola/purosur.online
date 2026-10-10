import { fetchQuarantinedEvents } from "./quarantined-events-api";
import type { ReleaseQuarantinedEventModalServices } from "./release-quarantined-event-modal";

export type QuarantinedEventsScreenServices = {
  fetchQuarantinedEvents: typeof fetchQuarantinedEvents;
  releaseQuarantinedEventModal?: ReleaseQuarantinedEventModalServices;
};

export const defaultQuarantinedEventsScreenServices: QuarantinedEventsScreenServices = {
  fetchQuarantinedEvents,
};
