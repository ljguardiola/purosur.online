import { SectionLink } from "../shell/area-layout";
import type { BackofficeHelpCatalog } from "./help-catalog";
import { sectionIcon } from "./section-icons";

export type HelpSectionColumnProps = {
  help: BackofficeHelpCatalog;
  activeCategoryId: string | null;
};

export function HelpSectionColumn({ help, activeCategoryId }: HelpSectionColumnProps) {
  return (
    <>
      <h2 className="font-bold text-brand-blue-strong text-xl">Ayuda</h2>
      <div className="h-2.5" />
      <ul className="flex flex-col gap-1">
        {Object.entries(help.categories).map(([id, category]) => (
          <li key={id}>
            <SectionLink
              to="/help/$categoryId"
              params={{ categoryId: id }}
              label={category.label}
              icon={sectionIcon(category.icon)}
              active={id === activeCategoryId}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
