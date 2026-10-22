import type { RestorationEvidence } from "../model/restoration-protocol.js";

export interface RestorationProtocolEvidence {
  evidence(): RestorationEvidence;
}
