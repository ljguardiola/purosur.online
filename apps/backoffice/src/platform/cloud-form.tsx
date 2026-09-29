import {
  createFormHook,
  revalidateLogic,
  type StandardSchemaV1,
  type StandardSchemaV1Issue,
  useStore,
} from "@tanstack/react-form";
import { fieldContext, formContext } from "./cloud-form-context";
import { BoundTextField } from "./cloud-form-fields";

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField: BoundTextField },
  formComponents: {},
});

type Message<Values> = string | ((values: Values) => string);

export type CloudSubmission<Values> = {
  values: Values;
  showWireFieldError: (wireField: string) => boolean;
  showFieldError: (field: keyof Values & string, message: string) => void;
};

type CloudFormOptions<
  Values extends Record<string, unknown>,
  Request extends Record<string, unknown>,
  Field extends keyof Values & string,
> = {
  defaultValues: Values;
  request: {
    schema: StandardSchemaV1<Request, unknown>;
    from: (values: Values) => Request;
  };
  fields: { [Wire in keyof Request & string]-?: Field };
  messages: Record<Field, Message<Values>>;
  onSubmit: (request: Request, submission: CloudSubmission<Values>) => Promise<void>;
};

function issueWireField(issue: StandardSchemaV1Issue): string | undefined {
  const [first] = issue.path ?? [];
  const key = typeof first === "object" ? first?.key : first;
  return typeof key === "string" ? key : undefined;
}

export function useCloudForm<
  Values extends Record<string, unknown>,
  Request extends Record<string, unknown>,
  Field extends keyof Values & string,
>(options: CloudFormOptions<Values, Request, Field>) {
  const { request, fields, messages } = options;
  const wireFields: Record<string, Field | undefined> = fields;
  const fieldOf = (wireField: string | undefined): Field | undefined =>
    wireField !== undefined && Object.hasOwn(fields, wireField) ? wireFields[wireField] : undefined;
  const messageFor = (field: Field, values: Values): string => {
    const message = messages[field];
    return typeof message === "function" ? message(values) : message;
  };

  const form = useAppForm({
    defaultValues: options.defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamicAsync: async ({ value }) => {
        const result = await request.schema["~standard"].validate(request.from(value));
        if (!result.issues) {
          return undefined;
        }
        const failures: Partial<Record<Field, string>> = {};
        let outsideFields = false;
        for (const issue of result.issues) {
          const field = fieldOf(issueWireField(issue));
          if (field === undefined) {
            outsideFields = true;
          } else {
            failures[field] = failures[field] ?? messageFor(field, value);
          }
        }
        return { form: outsideFields ? "invalid" : undefined, fields: failures };
      },
    },
    listeners: { onChange: ({ fieldApi }) => clearFieldError(fieldApi.name) },
    onSubmit: ({ value }) =>
      options.onSubmit(request.from(value), {
        values: value,
        showWireFieldError,
        showFieldError,
      }),
  });

  function showFieldError(field: keyof Values & string, message: string) {
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: message },
    }));
  }

  function showWireFieldError(wireField: string): boolean {
    const field = fieldOf(wireField);
    if (field === undefined) {
      return false;
    }
    showFieldError(field, messageFor(field, form.state.values));
    return true;
  }

  function clearFieldError(field: keyof Values & string) {
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: undefined },
    }));
  }

  async function submit() {
    for (const field of Object.values(wireFields)) {
      if (field !== undefined) {
        clearFieldError(field);
      }
    }
    await form.handleSubmit();
  }

  const reset: () => void = form.reset;

  return {
    form,
    submit,
    submitting: useStore(form.store, (state) => state.isSubmitting),
    reset,
  };
}
