import type { OperationAuthority, OperationAuthorization } from "../../../shared/index.js";

export class FakeOperationAuthority<Grant, Refusal> implements OperationAuthority<Grant, Refusal> {
  asked = 0;
  private readonly answer: OperationAuthorization<Grant, Refusal>;

  constructor(answer: OperationAuthorization<Grant, Refusal>) {
    this.answer = answer;
  }

  async authorize(): Promise<OperationAuthorization<Grant, Refusal>> {
    this.asked += 1;
    return this.answer;
  }
}

export function granting<Grant>(grant: Grant): FakeOperationAuthority<Grant, never> {
  return new FakeOperationAuthority<Grant, never>({ kind: "granted", grant });
}

export function refusing<Refusal>(refusal: Refusal): FakeOperationAuthority<never, Refusal> {
  return new FakeOperationAuthority<never, Refusal>({ kind: "refused", refusal });
}
