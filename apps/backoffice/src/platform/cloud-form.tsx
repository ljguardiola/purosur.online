import {
  createFormHook,
  evaluate,
  revalidateLogic,
  type StandardSchemaV1,
  type StandardSchemaV1Issue,
  useStore,
} from "@tanstack/react-form";
import { useState } from "react";
import { fieldContext, formContext } from "./cloud-form-context";
import {
  BoundDateField,
  BoundOptionCardGroup,
  BoundQuantityUnitField,
  BoundSelect,
  BoundTextField,
} from "./cloud-form-fields";

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField: BoundTextField,
    Select: BoundSelect,
    DateField: BoundDateField,
    QuantityUnitField: BoundQuantityUnitField,
    OptionCardGroup: BoundOptionCardGroup,
  },
  formComponents: {},
});

type Message<Values> = string | ((values: Values) => string);

export type CloudSubmission<Values, Parsed = unknown> = {
  values: Values;
  parsed: Parsed;
  showWireFieldError: (wireField: string) => boolean;
  showFieldError: (field: keyof Values & string, message: string) => void;
};

type CloudFormOptions<
  Values extends Record<string, unknown>,
  Request extends Record<string, unknown>,
  Parsed,
  Field extends keyof Values & string,
> = {
  defaultValues: Values;
  request: {
    schema: StandardSchemaV1<Request, Parsed>;
    from: (values: Values) => Request;
  };
  fields: { [Wire in keyof Request & string]-?: Field | null } & Partial<
    Record<string, Field | null>
  >;
  messages: Record<Field, Message<Values>>;
  onSubmit: (request: Request, submission: CloudSubmission<Values, Parsed>) => Promise<void>;
};

const NOTHING_STARTED: { started: Promise<void> | undefined } = { started: undefined };

function issueWireField(issue: StandardSchemaV1Issue): string | undefined {
  const [first] = issue.path ?? [];
  const key = typeof first === "object" ? first?.key : first;
  return typeof key === "string" ? key : undefined;
}

export function useCloudForm<
  Values extends Record<string, unknown>,
  Request extends Record<string, unknown>,
  Parsed,
  Field extends keyof Values & string,
>(options: CloudFormOptions<Values, Request, Parsed, Field>) {
  const { request, fields, messages } = options;
  const wireFields: Record<string, Field | null | undefined> = fields;
  const fieldOf = (wireField: string | undefined): Field | undefined =>
    wireField !== undefined && Object.hasOwn(fields, wireField)
      ? (wireFields[wireField] ?? undefined)
      : undefined;
  const messageFor = (field: Field, values: Values): string => {
    const message = messages[field];
    return typeof message === "function" ? message(values) : message;
  };

  const validate = (body: Request) => {
    const result = request.schema["~standard"].validate(body);
    if (result instanceof Promise) {
      throw new TypeError("A form's request schema must validate synchronously.");
    }
    return result;
  };
  const failuresOf = (values: Values) => {
    const { issues } = validate(request.from(values));
    if (!issues) {
      return undefined;
    }
    const failures: Partial<Record<Field, string>> = {};
    let outsideFields = false;
    for (const issue of issues) {
      const field = fieldOf(issueWireField(issue));
      if (field === undefined) {
        outsideFields = true;
      } else {
        failures[field] = failures[field] ?? messageFor(field, values);
      }
    }
    return { form: outsideFields ? "invalid" : undefined, fields: failures };
  };

  const [defaultValues] = useState(() => options.defaultValues);
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: ({ value }) => failuresOf(value),
    },
    listeners: { onChange: ({ fieldApi }) => clearFieldError(fieldApi.name) },
    onSubmitMeta: NOTHING_STARTED,
    onSubmit: ({ meta }) => meta.started,
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
      if (field) {
        clearFieldError(field);
      }
    }
    const values = form.state.values;
    const body = request.from(values);
    const result = validate(body);
    const started = result.issues
      ? undefined
      : options.onSubmit(body, {
          values,
          parsed: result.value,
          showWireFieldError,
          showFieldError,
        });
    await form.handleSubmit({ started });
  }

  const [loaded, setLoaded] = useState(defaultValues);
  const [reset] = useState(() => (values?: Values) => {
    setLoaded(values ?? defaultValues);
    form.reset(values, { keepDefaultValues: true });
  });
  const currentValues = useStore(form.store, (state) => state.values);

  return {
    form,
    submit,
    submitting: useStore(form.store, (state) => state.isSubmitting),
    values: currentValues,
    dirty: !evaluate(currentValues, loaded),
    reset,
  };
}
