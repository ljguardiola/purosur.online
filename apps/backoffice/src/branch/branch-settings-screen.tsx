import { branchSettingsEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloudForm } from "../platform/cloud-form";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { BranchDayRow } from "./branch-day-row";
import { useBranchSettingsQuery, useReloadBranchSettings } from "./branch-queries";
import type { BranchSettings } from "./branch-settings-api";
import { BRANCH_DAYS } from "./branch-settings-api";
import {
  EMPTY_VALUES,
  MESSAGES,
  REQUEST_FIELDS,
  requestFrom,
  valuesFrom,
} from "./branch-settings-form";
import type { BranchSettingsScreenServices } from "./branch-settings-services";

export type BranchSettingsScreenProps = {
  onSessionEnded: () => void;
  services: BranchSettingsScreenServices;
};

type FormNotice = { kind: "attemptFailed" } | { kind: "staleVersion" };

export function BranchSettingsScreen({ onSessionEnded, services }: BranchSettingsScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const { fetchBranchSettings, saveBranchSettings } = services;
  const data = useBranchSettingsQuery({ fetchBranchSettings, onSessionEnded });
  const reloadBranchSettings = useReloadBranchSettings({ fetchBranchSettings });
  const [seededFrom, setSeededFrom] = useState<BranchSettings | null>(null);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reseedOnNextLoad, setReseedOnNextLoad] = useState(false);
  const { form, submit, submitting, dirty, reset } = useCloudForm({
    defaultValues: EMPTY_VALUES,
    request: { schema: branchSettingsEditBodySchema, from: requestFrom },
    fields: REQUEST_FIELDS,
    messages: MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      setNotice(null);
      const outcome = await saveBranchSettings(request);
      if (outcome.kind === "ok") {
        const reloaded = await reloadBranchSettings();
        if (reloaded.kind === "ok") {
          showServerSettings(reloaded.value);
        } else {
          setReseedOnNextLoad(true);
        }
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
        setNotice({ kind: "staleVersion" });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  const settings = data.status === "loaded" ? data.value : null;

  function showServerSettings(reloaded: BranchSettings) {
    reset(valuesFrom(reloaded));
    setSeededFrom(reloaded);
    setNotice(null);
    setReseedOnNextLoad(false);
  }

  useEffect(() => {
    if (settings !== null && settings !== seededFrom && (reseedOnNextLoad || !dirty)) {
      reset(valuesFrom(settings));
      setSeededFrom(settings);
      setNotice(null);
      setReseedOnNextLoad(false);
    }
  }, [settings, seededFrom, reseedOnNextLoad, dirty, reset]);

  async function handleReload() {
    setReloading(true);
    const outcome = await reloadBranchSettings();
    if (outcome.kind === "ok") {
      showServerSettings(outcome.value);
      setReloading(false);
      return;
    }
    if (outcome.kind === "unauthenticated" || outcome.kind === "forbidden") {
      return;
    }
    setNotice(null);
    setReseedOnNextLoad(true);
    setReloading(false);
  }

  const offersReload = notice?.kind === "staleVersion";
  const busy = submitting || reloading;

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Configuración</p>
            <ScreenTitle>Sucursal</ScreenTitle>
          </div>
          <Button
            variant="primary"
            icon={<Check />}
            dataStatus={data.status}
            disabled={busy}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={6} />}
      {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "la sucursal")} />}
      {notice?.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo guardar la sucursal"
          description="Probá de nuevo."
        />
      )}
      {notice?.kind === "staleVersion" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La sucursal cambió mientras la editabas"
          description="Recargá sus datos y volvé a hacer el cambio."
        />
      )}
      {offersReload ? (
        <Button
          variant="secondary"
          icon={<RotateCcw />}
          disabled={busy}
          onPress={() => void handleReload()}
        >
          Recargar
        </Button>
      ) : null}
      {data.status === "loaded" && seededFrom !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-text-accent text-subheading">Encabezado del ticket</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <form.AppField name="address">
                  {(field) => <field.TextField kind="plain-text" label="Dirección" />}
                </form.AppField>
              </div>
              <div className="flex-1">
                <form.AppField name="whatsappNumber">
                  {(field) => <field.TextField kind="plain-text" label="WhatsApp" />}
                </form.AppField>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <form.AppField name="instagramHandle">
                  {(field) => <field.TextField kind="plain-text" label="Instagram" />}
                </form.AppField>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-2 text-text-accent text-subheading">Horario de atención</h2>
            {BRANCH_DAYS.map((day) => (
              <form.AppField key={day} name={day}>
                {() => <BranchDayRow day={day} />}
              </form.AppField>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-text-accent text-subheading">Plazos</h2>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <form.AppField name="expiringLotAlertDays">
                  {(field) => (
                    <field.TextField kind="plain-text" label="Aviso de vencimiento" suffix="días" />
                  )}
                </form.AppField>
              </div>
              <div className="min-w-0 flex-1">
                <form.AppField name="unreviewedPriceAlertDays">
                  {(field) => (
                    <field.TextField kind="plain-text" label="Precio sin revisar" suffix="días" />
                  )}
                </form.AppField>
              </div>
              <div className="min-w-0 flex-1">
                <form.AppField name="goodConditionReturnDays">
                  {(field) => (
                    <field.TextField
                      kind="plain-text"
                      label="Cambio en buen estado"
                      suffix="días"
                    />
                  )}
                </form.AppField>
              </div>
            </div>
          </div>
        </div>
      )}
    </ScreenLayout>
  );
}
