import { InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { UserX } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { UserDataFields } from "./user-data-fields";
import type { UserDetailScreenServices } from "./user-detail-services";
import { useUserQuery } from "./users-queries";

export type OwnUserDataProps = {
  userId: string;
  onSessionEnded: () => void;
  services: Pick<UserDetailScreenServices, "fetchUser">;
};

export function OwnUserData({ userId, onSessionEnded, services }: OwnUserDataProps) {
  const data = useUserQuery({ userId, fetchUser: services.fetchUser, onSessionEnded });
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="form" fields={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "tus datos")} />;
  }
  if (data.status !== "loaded") {
    return null;
  }
  return data.value.kind === "found" ? (
    <UserDataFields user={data.value.user} />
  ) : (
    <InlineNotice tone="error" icon={<UserX />} title="No encontramos tus datos" />
  );
}
