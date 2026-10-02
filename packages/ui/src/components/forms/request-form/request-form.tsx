import {
  createFormHook,
  evaluate,
  revalidateLogic,
  type StandardSchemaV1,
  type StandardSchemaV1Issue,
  useStore,
} from "@tanstack/react-form";
import { useRef, useState } from "react";
import { fieldContext, formContext } from "./request-form-context";
import {
  BoundComboBox,
  BoundDateField,
  BoundOptionCardGroup,
  BoundQuantityUnitField,
  BoundSegmentedControl,
  BoundSelect,
  BoundTextField,
  BoundToggle,
  BoundToggleChipGroup,
} from "./request-form-fields";

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField: BoundTextField,
    ComboBox: BoundComboBox,
    Select: BoundSelect,
    DateField: BoundDateField,
    QuantityUnitField: BoundQuantityUnitField,
    OptionCardGroup: BoundOptionCardGroup,
    SegmentedControl: BoundSegmentedControl,
    ToggleChipGroup: BoundToggleChipGroup,
    Toggle: BoundToggle,
  },
  formComponents: {},
});

type Message<Values> = string | ((values: Values) => string);

type FieldDeclaration<Values, Field> = Field | null | ((values: Values) => Field);

export type RequestSubmission<Values, Parsed = unknown> = {
  values: Values;
  parsed: Parsed | undefined;
  showWireFieldError: (wireField: string) => boolean;
  showFieldError: (field: keyof Values & string, message: string) => void;
};

type RequestFormOptions<
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
  fields: { [Wire in keyof Request & string]-?: FieldDeclaration<Values, Field> } & Partial<
    Record<string, FieldDeclaration<Values, Field>>
  >;
  messages: Record<Field, Message<Values>>;
  check?: (request: Request) => Promise<readonly string[]>;
  onSubmit: (request: Request, submission: RequestSubmission<Values, Parsed>) => Promise<void>;
};

const NOTHING_STARTED: { started: Promise<void> | undefined } = { started: undefined };

function issueWireFields(issue: StandardSchemaV1Issue): string[] {
  const keys: string[] = [];
  for (const segment of issue.path ?? []) {
    const key = typeof segment === "object" ? segment.key : segment;
    if (typeof key !== "string") {
      break;
    }
    keys.push(key);
  }
  return keys.map((_, index) => keys.slice(0, keys.length - index).join("."));
}

export function useRequestForm<
  Values extends Record<string, unknown>,
  Request extends Record<string, unknown>,
  Parsed,
  Field extends keyof Values & string,
>(options: RequestFormOptions<Values, Request, Parsed, Field>) {
  const { request, fields, messages, check } = options;
  const wireFields: Record<string, FieldDeclaration<Values, Field> | undefined> = fields;
  const fieldOf = (wireField: string, values: Values): Field | undefined => {
    const declared = Object.hasOwn(fields, wireField) ? wireFields[wireField] : undefined;
    return (typeof declared === "function" ? declared(values) : declared) ?? undefined;
  };
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
  const failuresOf = (
    values: Values,
    issues: readonly StandardSchemaV1Issue[] = [],
    refusedWireFields: readonly string[] = [],
  ): Partial<Record<Field, string>> | undefined => {
    const failures: Partial<Record<Field, string>> = {};
    const failingWireFields = [
      ...issues.map((issue) => issueWireFields(issue)),
      ...refusedWireFields.map((wireField) => [wireField]),
    ];
    for (const wireFields of failingWireFields) {
      const field = wireFields
        .map((wireField) => fieldOf(wireField, values))
        .find((declared) => declared !== undefined);
      if (field !== undefined) {
        failures[field] = failures[field] ?? messageFor(field, values);
      }
    }
    return Object.keys(failures).length > 0 ? failures : undefined;
  };

  const checked = useRef({ asked: 0, refused: [] as readonly string[] });

  async function askCheck(
    checkRequest: (request: Request) => Promise<readonly string[]>,
    body: Request,
  ): Promise<{ refusedWireFields: readonly string[]; latest: boolean }> {
    checked.current.asked += 1;
    const asked = checked.current.asked;
    const refusedWireFields = validate(body).issues
      ? []
      : await checkRequest(body).catch((): readonly string[] => []);
    const latest = asked === checked.current.asked;
    if (latest) {
      checked.current.refused = refusedWireFields;
    }
    return { refusedWireFields, latest };
  }

  async function recheck(checkRequest: (request: Request) => Promise<readonly string[]>) {
    const { latest } = await askCheck(checkRequest, request.from(form.state.values));
    if (latest && form.state.submissionAttempts > 0) {
      await form.validate("change");
    }
  }

  const [defaultValues] = useState(() => options.defaultValues);
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = failuresOf(
          value,
          validate(request.from(value)).issues,
          checked.current.refused,
        );
        return fields && { fields };
      },
    },
    listeners: {
      onChange: ({ fieldApi }) => {
        clearFieldError(fieldApi.name);
        if (check !== undefined && checked.current.asked > 0) {
          void recheck(check);
        }
      },
    },
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
    const field = fieldOf(wireField, form.state.values);
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

  const [unsettled, setUnsettled] = useState(0);

  async function submit() {
    for (const field of Object.keys(messages) as Field[]) {
      if (form.getFieldMeta(field) !== undefined) {
        clearFieldError(field);
      }
    }
    const values = form.state.values;
    const body = request.from(values);
    const result = validate(body);
    if (failuresOf(values, result.issues)) {
      await form.handleSubmit(NOTHING_STARTED);
      return;
    }
    if (check !== undefined) {
      setUnsettled((count) => count + 1);
      const { refusedWireFields } = await askCheck(check, body).finally(() =>
        setUnsettled((count) => count - 1),
      );
      if (failuresOf(values, [], refusedWireFields)) {
        await form.handleSubmit(NOTHING_STARTED);
        return;
      }
    }
    const started = options.onSubmit(body, {
      values,
      parsed: result.issues ? undefined : result.value,
      showWireFieldError,
      showFieldError,
    });
    setUnsettled((count) => count + 1);
    // handleSubmit returns without awaiting started while a field shows an error, including one
    // onSubmit has just set.
    await Promise.all([form.handleSubmit({ started }), started]).finally(() =>
      setUnsettled((count) => count - 1),
    );
  }

  const [loaded, setLoaded] = useState(defaultValues);
  const [reset] = useState(() => (values?: Values) => {
    setLoaded(values ?? defaultValues);
    form.reset(values, { keepDefaultValues: true });
  });
  const currentValues = useStore(form.store, (state) => state.values);
  const tanStackSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return {
    form,
    submit,
    clearFieldError,
    submitting: tanStackSubmitting || unsettled > 0,
    values: currentValues,
    dirty: !evaluate(currentValues, loaded),
    reset,
  };
}
