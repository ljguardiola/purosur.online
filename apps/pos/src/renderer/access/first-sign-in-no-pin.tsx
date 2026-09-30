import { ArrowLeft } from "lucide-react";
import { ScreenLink } from "../shell/screen-link";
import { FirstSignInPanel } from "./first-sign-in-panel";

export function FirstSignInNoPin({ firstName }: { firstName: string }) {
  return (
    <FirstSignInPanel eyebrow={firstName} title="No tenés PIN todavía">
      <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
    </FirstSignInPanel>
  );
}
