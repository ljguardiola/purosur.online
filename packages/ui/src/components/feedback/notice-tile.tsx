import type { Icon } from "../shared/icon";
import { type NoticeTone, toneClassName } from "../shared/tone";
import { NoticeFrame } from "./notice-frame";

export type NoticeTileProps = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  subtitle: string;
  description?: string;
  whatToDo?: string;
  focused: boolean;
};

export function NoticeTile({
  tone,
  icon,
  title,
  subtitle,
  description,
  whatToDo,
  focused,
}: NoticeTileProps) {
  const className = [
    "flex w-full items-start gap-3 rounded-lg border-2 px-3 py-3",
    toneClassName[tone].surface,
    focused ? "border-focus" : "border-transparent",
  ].join(" ");
  const shownDescription = focused ? description : undefined;
  const shownWhatToDo = focused ? whatToDo : undefined;

  return (
    <NoticeFrame
      tone={tone}
      className={className}
      icon={icon}
      iconSize="md"
      announcement={[title, subtitle, shownDescription, shownWhatToDo]}
      current={focused}
    >
      <p className={`text-body font-bold ${toneClassName[tone].strongText}`}>{title}</p>
      <p className={`text-detail ${toneClassName[tone].strongText}`}>{subtitle}</p>
      {shownDescription ? <p className="text-detail text-text-subtle">{shownDescription}</p> : null}
      {shownWhatToDo ? (
        <p className="text-detail font-semibold text-text">{shownWhatToDo}</p>
      ) : null}
    </NoticeFrame>
  );
}
