import type { RestorationEvidence } from "../../register/index.js";

export interface RegisterRestoration {
  evidence(): RestorationEvidence;
}
