export type OperationAuthorization<Grant, Refusal> =
  | { kind: "granted"; grant: Grant }
  | { kind: "refused"; refusal: Refusal };

export interface OperationAuthority<Grant, Refusal> {
  authorize(): Promise<OperationAuthorization<Grant, Refusal>>;
}
