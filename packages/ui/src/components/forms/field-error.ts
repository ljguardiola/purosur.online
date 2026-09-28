export type FieldErrorProps =
  | { errorMessage?: string | undefined; errorMessageId?: undefined }
  | { errorMessageId: string; errorMessage?: undefined };

type FieldError = {
  invalid: boolean;
  errorMessage: string | undefined;
  errorMessageId: string | undefined;
};

export function fieldError({ errorMessage, errorMessageId }: FieldErrorProps): FieldError {
  return {
    invalid: errorMessage !== undefined || errorMessageId !== undefined,
    errorMessage,
    errorMessageId,
  };
}
