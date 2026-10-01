import { recoveryRedemptionBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, LoadFailure, LoadingPlaceholder, useRequestForm } from "@purosur/ui";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./access-layout";
import { useRegistrationOptionsQuery, useReloadRegistrationOptions } from "./access-queries";
import { passkeyNameMessage } from "./passkey-name-message";
import type { RedeemRecoveryOutcome } from "./recovery-api";
import type { RegisterPasskeyScreenServices } from "./register-passkey-services";

function isDefinitiveRejection(outcome: RedeemRecoveryOutcome): boolean {
  switch (outcome.kind) {
    case "invalid":
    case "burned":
    case "expired":
    case "validation_failed":
    case "rate_limited":
      return true;
    case "ok":
    case "already_registered":
    case "failed":
      return false;
  }
}

const PASSKEY_NAME_REQUEST = recoveryRedemptionBodySchema.pick({ passkey_name: true });

type TokenState = "invalid" | "burned" | "expired";

type RedeemResult =
  | { kind: "registered" }
  | { kind: TokenState }
  | { kind: "rate_limited"; retryAfterSeconds: number };

const TOKEN_STATE_COPY: Record<TokenState, { title: string; description: string }> = {
  invalid: {
    title: "Este enlace no es válido",
    description: "Revisá que el enlace esté completo.",
  },
  burned: {
    title: "Este enlace ya no se puede usar",
    description: "Ya se usó o se pidió uno más nuevo.",
  },
  expired: { title: "Este enlace venció", description: "Los enlaces valen 15 minutos." },
};

export type RegisterPasskeyScreenProps = {
  services: RegisterPasskeyScreenServices;
};

function TokenErrorNotice({
  title,
  description,
  offerNewLink,
}: {
  title: string;
  description?: string;
  offerNewLink: boolean;
}) {
  return (
    <>
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title={title}
        {...(description ? { description } : {})}
      />
      {offerNewLink ? (
        <AccessFooterLink
          to="/account-recovery"
          icon={<ArrowLeft />}
          label="Pedir un enlace nuevo"
        />
      ) : null}
    </>
  );
}

function readToken(): string | null {
  const hash = window.location.hash;
  return hash.length > 1 ? hash.slice(1) : null;
}

function TokenStateNotice({ state }: { state: TokenState }) {
  return (
    <AccessLayout>
      <AccessHeader heading="Registrá una passkey nueva" />
      <TokenErrorNotice {...TOKEN_STATE_COPY[state]} offerNewLink />
    </AccessLayout>
  );
}

export function RegisterPasskeyScreen({ services }: RegisterPasskeyScreenProps) {
  // A lazy initializer runs during the initial render, before any effect strips the fragment;
  // StrictMode's doubled call falls within that same render, so both reads see the same token.
  const [token] = useState<string | null>(() => readToken());

  useEffect(() => {
    // A URL fragment never reaches server logs or a Referer header, but it's stripped right away
    // so it doesn't linger in the address bar; idempotent, so a StrictMode-doubled run is a no-op.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return token ? (
    <RegistrationOfToken token={token} services={services} />
  ) : (
    <TokenStateNotice state="invalid" />
  );
}

function RegistrationOfToken({
  token,
  services,
}: {
  token: string;
  services: RegisterPasskeyScreenServices;
}) {
  const { fetchRegistrationOptions, redeemRecovery, startRegistration, signalUnknownCredential } =
    services;
  const data = useRegistrationOptionsQuery({ token, fetchRegistrationOptions });
  const readOptionsAgain = useReloadRegistrationOptions({ fetchRegistrationOptions });
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { name: "" },
    request: {
      schema: PASSKEY_NAME_REQUEST,
      from: ({ name }) => ({ passkey_name: name.trim() }),
    },
    fields: { passkey_name: "name" },
    messages: { name: passkeyNameMessage },
    onSubmit: async ({ passkey_name }, { showWireFieldError }) => {
      if (data.status !== "loaded" || data.value.kind !== "ready") {
        return;
      }
      const { options } = data.value;
      setAttemptFailed(false);

      const registration = await startRegistration({ optionsJSON: options }).catch(() => null);
      if (!registration) {
        setAttemptFailed(true);
        return;
      }

      const outcome = await redeemRecovery(token, registration, passkey_name);
      // Every definitive rejection but "already registered" means the credential was never saved,
      // so the device should forget it; an ambiguous outcome never signals, since it may have landed.
      if (isDefinitiveRejection(outcome)) {
        const rpId = options.rp.id;
        if (rpId) {
          signalUnknownCredential({ rpId, credentialId: registration.id });
        }
      }
      switch (outcome.kind) {
        case "ok":
          setResult({ kind: "registered" });
          return;
        case "invalid":
        case "burned":
        case "expired":
          setResult({ kind: outcome.kind });
          return;
        case "rate_limited":
          setResult({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
          return;
        case "validation_failed":
          if (outcome.field !== undefined && showWireFieldError(outcome.field)) {
            await readOptionsAgain(token);
            return;
          }
          await refreshAfterRejectedAttempt();
          return;
        case "already_registered":
          await refreshAfterRejectedAttempt();
          return;
        case "failed":
          setAttemptFailed(true);
          return;
      }
    },
  });

  // A rejected attempt needs fresh options before retrying; read now so the next click still
  // starts WebAuthn synchronously, within the browser's required user activation.
  async function refreshAfterRejectedAttempt() {
    setAttemptFailed(true);
    await readOptionsAgain(token);
  }

  if (result?.kind === "registered") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registraste la passkey" />
        <InlineNotice
          tone="info"
          icon={<ShieldCheck />}
          title="Se cerraron las sesiones abiertas de tu cuenta"
          description="Si alguien más estaba adentro con tu cuenta, ya no lo está."
        />
        <AccessFooterLink to="/sign-in" icon={<ArrowLeft />} label="Ir a ingresar" />
      </AccessLayout>
    );
  }

  if (result?.kind === "rate_limited") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiados intentos desde esta conexión"
          description={retryAfterDetail(result.retryAfterSeconds)}
        />
      </AccessLayout>
    );
  }

  if (result) {
    return <TokenStateNotice state={result.kind} />;
  }

  if (data.status === "loading") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <LoadingPlaceholder variant="form" fields={1} />
      </AccessLayout>
    );
  }

  if (data.status === "failed") {
    return (
      <AccessLayout>
        <AccessHeader heading="Registrá una passkey nueva" />
        <LoadFailure {...cloudLoadFailure(data, "el registro")} />
      </AccessLayout>
    );
  }

  if (data.value.kind !== "ready") {
    return <TokenStateNotice state={data.value.kind} />;
  }

  const { displayName } = data.value;
  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={displayName}
        heading="Registrá una passkey nueva"
        description="Con ella vas a ingresar de ahora en adelante."
      />
      {attemptFailed ? (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo registrar la passkey"
          description="Podés volver a intentarlo con este mismo enlace."
        />
      ) : null}
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            kind="plain-text"
            label="Nombre de la passkey"
            description="Por ejemplo, Notebook del local."
            required
          />
        )}
      </form.AppField>
      <Button
        variant="primary"
        size="large"
        fullWidth
        icon={<KeyRound />}
        disabled={submitting}
        onPress={() => void submit()}
      >
        Registrar la passkey
      </Button>
      <p className="text-detail text-text-subtle">
        Después conviene agregar una segunda, por ejemplo en el teléfono, desde Mi cuenta.
      </p>
    </AccessLayout>
  );
}
