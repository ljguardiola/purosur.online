import {
  TAX_AUTHORITY_HOLDING_ANSWER_KIND,
  TAX_AUTHORITY_HOLDING_DECISION_KIND,
} from "@purosur/domain";
import { eq, or } from "drizzle-orm";
import { fiscalRequests } from "../platform/db/schema.js";

export const heldByTaxAuthority = or(
  eq(fiscalRequests.answerKind, TAX_AUTHORITY_HOLDING_ANSWER_KIND),
  eq(fiscalRequests.decision, TAX_AUTHORITY_HOLDING_DECISION_KIND),
);
