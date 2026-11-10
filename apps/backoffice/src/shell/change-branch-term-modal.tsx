import { branchSettingsEditBodySchema } from "@purosur/contracts";
import {
  Button,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Settings2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  branchKey,
  useBranchSettingsQuery,
  useReloadBranchSettings,
} from "../branch/branch-queries";
import type {
  BranchSettings,
  fetchBranchSettings,
  saveBranchSettings,
} from "../branch/branch-settings-api";
import {
  EMPTY_VALUES,
  MESSAGES,
  REQUEST_FIELDS,
  requestFrom,
  TERM_FIELDS,
  valuesFrom,
} from "../branch/branch-settings-form";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { BRANCH_TERMS, type BranchTerm } from "./branch-terms";

export type ChangeBranchTermModalServices = {
  fetchBranchSettings: typeof fetchBranchSettings;
  saveBranchSettings: typeof saveBranchSettings;
};

type ChangeBranchTermModalProps = {
  term: BranchTerm;
  onClose: () => void;
  onChanged: () => void;
  onSessionEnded: () => void;
  services: ChangeBranchTermModalServices;
};

type FormNotice = "attemptFailed" | "staleVersion";

export function ChangeBranchTermModal({
  term,
  onClose,
  onChanged,
  onSessionEnded,
  services,
}: ChangeBranchTermModalProps) {
  const { fetchBranchSettings, saveBranchSettings } = services;
  const client = useQueryClient();
  const sendToMyAccount = useSendToMyAccount();
  const data = useBranchSettingsQuery({ fetchBranchSettings, onSessionEnded });
  const reloadBranchSettings = useReloadBranchSettings({ fetchBranchSettings });
  const [seededFrom, setSeededFrom] = useState<BranchSettings | null>(null);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const { form, submit, submitting, dirty, reset } = useRequestForm({
    defaultValues: EMPTY_VALUES,
    request: { schema: branchSettingsEditBodySchema, from: requestFrom },
    fields: REQUEST_FIELDS,
    messages: MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      setNotice(null);
      const outcome = await saveBranchSettings(request);
      if (outcome.kind === "ok") {
        void client.invalidateQueries({ queryKey: branchKey });
        onChanged();
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "stale_version") {
        const reloaded = await reloadBranchSettings();
        if (reloaded.kind === "ok") {
          reset(valuesFrom(reloaded.value));
          setSeededFrom(reloaded.value);
        }
        setNotice("staleVersion");
        return;
      }
      setNotice("attemptFailed");
    },
  });

  const settings = data.status === "loaded" ? data.value : null;

  useEffect(() => {
    if (settings !== null && settings !== seededFrom && !dirty) {
      reset(valuesFrom(settings));
      setSeededFrom(settings);
    }
  }, [settings, seededFrom, dirty, reset]);

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Settings2 />}
      context="Sucursal"
      title={BRANCH_TERMS[term].modalTitle}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={data.status}
            disabled={submitting}
            onPress={() => void submit()}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {data.status === "loading" && <LoadingPlaceholder variant="form" fields={1} />}
        {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "la sucursal")} />}
        {notice === "attemptFailed" && (
          <ActionFailureNotice title="No se pudo guardar la sucursal" />
        )}
        {notice === "staleVersion" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="La sucursal cambió mientras la editabas"
            description="Revisá el valor y volvé a guardarlo."
          />
        )}
        {seededFrom !== null && (
          <form.AppField name={term}>
            {(field) => <field.TextField kind="plain-text" {...TERM_FIELDS[term]} />}
          </form.AppField>
        )}
      </div>
    </Modal>
  );
}
