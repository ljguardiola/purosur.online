import type { ReactNode, Ref } from "react";
import { Keycap } from "../data-display/keycap";
import { CardTitleRow, cardSurfaceClassName } from "../shared/card-surface";
import type { Icon } from "../shared/icon";

export type CardPanelProps = { children: ReactNode } & (
  | {
      icon: Icon;
      title: string;
      titleRef?: Ref<HTMLHeadingElement> | undefined;
      escapeKeycap?: boolean | undefined;
    }
  | { icon?: undefined; title?: undefined; titleRef?: undefined; escapeKeycap?: undefined }
);

export function CardPanel({
  children,
  icon,
  title,
  titleRef,
  escapeKeycap = false,
}: CardPanelProps) {
  return (
    <div className={`flex max-w-full flex-col gap-4 p-6 ${cardSurfaceClassName}`}>
      {icon === undefined ? null : (
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
      )}
      {children}
    </div>
  );
}
