import type { OperationAuthority, OperationAuthorization } from "../../../shared/index.js";

export class FakeOperationAuthority<Grant, Refusal> implements OperationAuthority<Grant, Refusal> {
  asked = 0;
  private readonly answer: OperationAuthorization<Grant, Refusal>;
  private readonly onAsk: () => void;

  constructor(answer: OperationAuthorization<Grant, Refusal>, onAsk: () => void = () => {}) {
    this.answer = answer;
    this.onAsk = onAsk;
  }

  async authorize(): Promise<OperationAuthorization<Grant, Refusal>> {
    this.asked += 1;
    this.onAsk();
    return this.answer;
  }
}
