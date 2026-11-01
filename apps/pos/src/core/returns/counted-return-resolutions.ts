import { countsAsReturned, RETURN_RESOLUTIONS } from "@purosur/domain";

export const COUNTED_RETURN_RESOLUTIONS_SQL = RETURN_RESOLUTIONS.filter((resolution) =>
  countsAsReturned({ resolution }),
)
  .map((resolution) => `'${resolution}'`)
  .join(", ");
