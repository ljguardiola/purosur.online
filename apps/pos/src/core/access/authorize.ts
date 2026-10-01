import type { Authorization } from "@purosur/contracts";
import type { RegisterOperation } from "@purosur/domain";
import { authorizeRegisterOperation } from "@purosur/domain/access/use-cases";
import { type AuthorizeOutcome, authorizationAnswer } from "./access-outcomes";
import { type PinCheckDeps, pinCheckPorts } from "./pin-matching";

export async function authorize(
  deps: PinCheckDeps,
  authorization: Authorization,
  operation: RegisterOperation,
): Promise<AuthorizeOutcome> {
  return authorizationAnswer(
    await authorizeRegisterOperation(pinCheckPorts(deps), {
      userId: authorization.user_id,
      pin: authorization.pin,
      operation,
    }),
  );
}
