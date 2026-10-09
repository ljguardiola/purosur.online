import type { CategoryRecord, HelpArticle, HelpCatalog } from "@purosur/ui";
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  HelpArticleBody,
  ScreenHeader,
  SearchField,
  SectionNavButton,
  searchArticles,
} from "@purosur/ui";
import { ArrowRight, FileText, House, Search, SearchX } from "lucide-react";
import { useState } from "react";
import { SignOutModal } from "../register/sign-out-modal";
import type { ActionEntry } from "../shell/action-entries";
import { entriesFor } from "../shell/action-entries";
import { NavigationRail } from "../shell/navigation-rail";
import type { SignedInPerson } from "../shell/signed-in-person";

type RegisterHelpCatalog = HelpCatalog<
  CategoryRecord,
  Record<string, HelpArticle<string, string>>
>;

export type HelpScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  help: RegisterHelpCatalog;
  entries: readonly ActionEntry[];
  signOut: () => void;
};

type Section = [id: string, article: HelpArticle<string, string>];

function sectionsMatching(help: RegisterHelpCatalog, query: string): Section[] {
  return query.trim() === "" ? Object.entries(help.articles) : searchArticles(help.articles, query);
}

export function HelpScreen({ person, registerName, help, entries, signOut }: HelpScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sections = sectionsMatching(help, query);
  const shown = sections.find(([id]) => id === selectedId) ?? sections[0];

  return (
    <div className="flex h-full w-full bg-surface">
      <NavigationRail
        entries={entriesFor(entries, person.abilities)}
        current="/help"
        home={{ label: "Inicio", icon: House, to: "/" }}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="Ayuda" />
        <div className="flex min-h-0 flex-1 gap-8">
          <div className="flex w-98 shrink-0 flex-col gap-4">
            <SearchField
              label="Buscar en la ayuda"
              placeholder="Buscar en la ayuda"
              icon={<Search />}
              value={query}
              onChange={setQuery}
            />
            <nav aria-label="Secciones de la ayuda" className="flex flex-col gap-4 overflow-y-auto">
              {Object.entries(help.categories).map(([categoryId, category]) => {
                const inCategory = sections.filter(
                  ([, article]) => article.category === categoryId,
                );
                return inCategory.length === 0 ? null : (
                  <section key={categoryId} className="flex flex-col gap-1">
                    <Eyebrow text={category.label} headingLevel={2} />
                    {inCategory.map(([id, article]) => (
                      <SectionNavButton
                        key={id}
                        label={article.title}
                        icon={<FileText />}
                        active={id === shown?.[0]}
                        onPress={() => setSelectedId(id)}
                      />
                    ))}
                  </section>
                );
              })}
            </nav>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            {shown === undefined ? (
              <EmptyState
                variant="filtered"
                icon={<SearchX />}
                title="Sin resultados"
                description="Probá con otras palabras."
              />
            ) : (
              <Card>
                <article className="flex flex-col gap-4">
                  <h2 className="text-title text-text-accent">{shown[1].title}</h2>
                  <HelpArticleBody
                    body={shown[1].body}
                    renderArticleLink={(articleId) => {
                      const linked = Object.hasOwn(help.articles, articleId)
                        ? help.articles[articleId]
                        : undefined;
                      return linked === undefined ? null : (
                        <div className="self-start">
                          <Button
                            variant="text"
                            size="small"
                            icon={<ArrowRight />}
                            onPress={() => {
                              setQuery("");
                              setSelectedId(articleId);
                            }}
                          >
                            {linked.title}
                          </Button>
                        </div>
                      );
                    }}
                  />
                </article>
              </Card>
            )}
          </div>
        </div>
      </main>
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}
