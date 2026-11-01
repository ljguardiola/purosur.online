import { cashMovementsSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

const movementShape = cashMovementsSchema.shape.movements.element.shape;

export const OCCURRED_TIME_ZONE = schemaText(movementShape.occurred_at.meta()?.["timeZone"]);
export const OPENED_TIME_ZONE = schemaText(movementShape.session_opened_at.meta()?.["timeZone"]);
