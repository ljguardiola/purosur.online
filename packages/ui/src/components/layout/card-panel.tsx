import type { ReactNode, Ref } from "react";
import { Keycap } from "../data-display/keycap";
import { CardTitleRow, cardSurfaceClassName } from "../shared/card-surface";
import type { Icon } from "../shared/icon";
import { Eyebrow } from "./eyebrow";

export type CardPanelProps = { children: ReactNode } & (
  | {
      icon: Icon;
      title: string;
      eyebrow?: string | undefined;
      titleRef?: Ref<HTMLHeadingElement> | undefined;
      escapeKeycap?: boolean | undefined;
    }
  | {
      icon?: undefined;
      title?: undefined;
      eyebrow?: undefined;
      titleRef?: undefined;
      escapeKeycap?: undefined;
    }
);

export function CardPanel({
  children,
  icon,
  title,
  eyebrow,
  titleRef,
  escapeKeycap = false,
}: CardPanelProps) {
  const titleRow =
    icon === undefined ? null : (
      <CardTitleRow
        icon={icon}
        gapClassName="gap-3"
        title={
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 flex-1 text-title text-text outline-none"
          >
            {title}
          </h1>
        }
        end={escapeKeycap ? <Keycap keyName="Escape" /> : null}
      />
    );

  return (
    <div className={`flex max-w-full flex-col gap-4 p-6 ${cardSurfaceClassName}`}>
      {eyebrow === undefined ? (
        titleRow
      ) : (
        <div className="flex flex-col gap-1">
          <Eyebrow text={eyebrow} />
          {titleRow}
        </div>
      )}
      {children}
    </div>
  );
}
