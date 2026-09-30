import { PIN_SIGN_IN_LOCKOUT_FAILURES } from "@purosur/domain";
import { Button, InlineNotice } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound } from "lucide-react";

export function SignInLockout({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();

  return (
    <>
      <p className="text-body text-text">
        Se equivocó {PIN_SIGN_IN_LOCKOUT_FAILURES} veces seguidas con el PIN.
      </p>
      <InlineNotice
        tone="warning"
        icon={<KeyRound />}
        title="Se vuelve a entrar con un código"
        description="Alguien con permiso lo genera desde el backoffice. Con el código se elige un PIN nuevo en esta caja, con internet."
      />
      <Button
        fullWidth
        icon={<KeyRound />}
        onPress={() => navigate({ to: "/pin-code-redemption" })}
      >
        Tengo un código
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex cursor-pointer items-center gap-2 self-start py-1 font-bold text-body text-text-accent outline-none focus-visible:focus-ring-tight"
      >
        <ArrowLeft aria-hidden="true" className="size-icon-sm shrink-0" />
        Volver a la lista de usuarios
      </button>
    </>
  );
}
