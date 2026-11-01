import { countsAsReturned, RETURN_RESOLUTIONS } from "@purosur/domain";

export const COUNTED_RETURN_RESOLUTIONS = RETURN_RESOLUTIONS.filter((resolution) =>
  countsAsReturned({ resolution }),
);
