import {
  Search,
  Calendar,
  Users,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  rosterSettingsApi,
  serviceLinesApi,
  getServiceLineContextFromEmployee,
  onlineUsersApi,
  searchApi,
  type GlobalSearchPersonPreview,
  type GlobalSearchResponse,
  type OnlineUser,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { employeeDoesShifts } from "@shared/shiftTypes";
import type { ServiceLine } from "@shared/schema";
import { useLocation } from "wouter";

function formatOnlineUserDisplayName(user: { name?: string | null; lastName?: string | null }) {
  const name = (user.name ?? "").trim();
  const last = (user.lastName ?? "").trim();

  if (!name && !last) return "–";
  if (!name) return last;
  if (!last) return name;

  const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.includes(last.toLowerCase())) return name;

  return `${name} ${last}`.trim();
}

export function Header({
  title,
  onToggleMobileNav,
  desktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
}: {
  title?: string;
  onToggleMobileNav?: () => void;
  desktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
}) {
  const {
    employee,
    user,
    capabilities,
    isAdmin,
    isTechnicalAdmin,
    isAdminActual,
    viewMode,
    setViewMode,
    viewAsUser,
  } = useAuth();
  const [location, setLocation] = useLocation();
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearchLoading, setHeaderSearchLoading] = useState(false);
  const [headerSearchError, setHeaderSearchError] = useState<string | null>(
    null,
  );
  const [headerSearchResults, setHeaderSearchResults] =
    useState<GlobalSearchResponse | null>(null);
  const [personPreviewById, setPersonPreviewById] = useState<
    Record<number, GlobalSearchPersonPreview | null | undefined>
  >({});
  const [personPreviewLoadingIds, setPersonPreviewLoadingIds] = useState<
    number[]
  >([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const canUseViewAsUserToggle =
    isAdminActual ||
    user?.appRole === "Editor" ||
    user?.appRole === "Ausbilder";
  const serviceLineMeta = useMemo(
    () =>
      serviceLines.map((line) => ({
        key: line.key,
        roleGroup: line.roleGroup,
        label: line.label,
      })),
    [serviceLines],
  );
  const doesShifts = employee
    ? employeeDoesShifts(employee, serviceLineMeta)
    : false;

  useEffect(() => {
    if (employee) {
      loadPlanningData();
    }
  }, [employee]);

  useEffect(() => {
    if (!headerSearchOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchBoxRef.current &&
        event.target instanceof Node &&
        !searchBoxRef.current.contains(event.target)
      ) {
        setHeaderSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [headerSearchOpen]);

  useEffect(() => {
    setHeaderSearchOpen(false);
    setMobileSearchOpen(false);
  }, [location]);

  useEffect(() => {
    const query = headerSearchQuery.trim();
    if (query.length < 2) {
      setHeaderSearchLoading(false);
      setHeaderSearchError(null);
      setHeaderSearchResults(null);
      setPersonPreviewById({});
      setPersonPreviewLoadingIds([]);
      return;
    }

    let active = true;
    setHeaderSearchLoading(true);
    setHeaderSearchError(null);
    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await searchApi.global(query, { limit: 5 });
        if (!active) return;
        setHeaderSearchResults(result);
        setPersonPreviewById({});
        setHeaderSearchOpen(true);
      } catch (error: any) {
        if (!active) return;
        setHeaderSearchResults(null);
        setHeaderSearchError(error?.message || "Suche fehlgeschlagen");
        setHeaderSearchOpen(true);
      } finally {
        if (active) setHeaderSearchLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [headerSearchQuery]);

  useEffect(() => {
    const people = headerSearchResults?.groups.people ?? [];
    const idsToLoad = people
      .map((person) => person.id)
      .filter(
        (id) =>
          personPreviewById[id] === undefined &&
          !personPreviewLoadingIds.includes(id),
      );
    if (!idsToLoad.length) return;

    let active = true;
    setPersonPreviewLoadingIds((prev) => [...prev, ...idsToLoad]);
    Promise.all(
      idsToLoad.map(async (id) => {
        try {
          const preview = await searchApi.personPreview(id, { days: 14 });
          return [id, preview] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setPersonPreviewById((prev) => {
        const next = { ...prev };
        entries.forEach(([id, preview]) => {
          next[id] = preview;
        });
        return next;
      });
      setPersonPreviewLoadingIds((prev) =>
        prev.filter((id) => !idsToLoad.includes(id)),
      );
    });

    return () => {
      active = false;
    };
  }, [headerSearchResults, personPreviewById, personPreviewLoadingIds]);

  useEffect(() => {
    if (!isAdminActual || viewAsUser) {
      setOnlineUsers([]);
      return;
    }
    let active = true;
    const loadOnlineUsers = async () => {
      try {
        const data = await onlineUsersApi.getAll();
        if (active) {
          setOnlineUsers(data.users);
        }
      } catch (error) {
        if (active) {
          setOnlineUsers([]);
        }
        console.error("Failed to load online users", error);
      }
    };
    loadOnlineUsers();
    const intervalId = setInterval(loadOnlineUsers, 30000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [isAdminActual, viewAsUser]);

  const loadPlanningData = async () => {
    try {
      const serviceLineData = await serviceLinesApi
        .getAll(getServiceLineContextFromEmployee(employee))
        .catch(() => []);
      setServiceLines(serviceLineData);
    } catch (error) {
      console.error("Failed to load planning data", error);
    }
  };

  const today = format(new Date(), "d. MMM yyyy", { locale: de });
  const onlineCount = onlineUsers.length;
  const formatOnlineUserDisplayName = (user: OnlineUser) => {
    const first = (user.name ?? "").trim();
    const last = (user.lastName ?? "").trim();
    if (!first && !last) return "Unbekannt";
    if (!last) return first;
    if (first.endsWith(last)) return first;
    return `${first} ${last}`;
  };

  const headerSearchTotal = headerSearchResults
    ? headerSearchResults.counts.sops +
      headerSearchResults.counts.videos +
      headerSearchResults.counts.presentations +
      headerSearchResults.counts.people
    : 0;

  const navigateFromSearch = (url: string) => {
    setHeaderSearchOpen(false);
    setMobileSearchOpen(false);
    setHeaderSearchQuery("");
    setHeaderSearchError(null);
    setHeaderSearchResults(null);
    setLocation(url);
  };

  const formatContactHref = (kind: "tel" | "mailto", value?: string | null) => {
    const raw = (value ?? "").trim();
    if (!raw) return null;
    if (kind === "mailto") return `mailto:${raw}`;
    const normalizedPhone = raw.replace(/[^\d+]/g, "");
    return normalizedPhone ? `tel:${normalizedPhone}` : null;
  };

  const renderSearchResults = (scrollClassName: string) => (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Suche
        </p>
        {headerSearchLoading ? (
          <span className="text-xs text-muted-foreground">Suche…</span>
        ) : headerSearchResults ? (
          <span className="text-xs text-muted-foreground">
            {headerSearchTotal} Treffer
          </span>
        ) : null}
      </div>

      {headerSearchError && (
        <p className="text-sm text-destructive">{headerSearchError}</p>
      )}

      {!headerSearchError &&
        !headerSearchLoading &&
        headerSearchQuery.trim().length < 2 && (
          <p className="text-sm text-muted-foreground">
            Mindestens 2 Zeichen eingeben.
          </p>
        )}

      {!headerSearchError &&
        !headerSearchLoading &&
        headerSearchResults &&
        headerSearchTotal === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine Treffer gefunden.
          </p>
        )}

      {!headerSearchError && headerSearchResults && headerSearchTotal > 0 && (
        <div className={`${scrollClassName} space-y-3 overflow-y-auto pr-1`}>
          {headerSearchResults.groups.people.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Personen
              </p>
              {headerSearchResults.groups.people.map((person) => (
                <div
                  key={`person-${person.id}`}
                  className="w-full rounded-lg border px-3 py-2 text-left"
                >
                  <button
                    type="button"
                    className="w-full text-left hover:opacity-90"
                    onClick={() => navigateFromSearch(person.url)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {person.displayName}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        Visitenkarte
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {person.role || "Mitarbeiter:in"}
                    </p>
                  </button>

                  <div className="mt-1 flex flex-wrap gap-2">
                    {[
                      {
                        label: person.contacts.phoneWork,
                        href: formatContactHref("tel", person.contacts.phoneWork),
                      },
                      {
                        label: person.contacts.phonePrivate,
                        href: formatContactHref("tel", person.contacts.phonePrivate),
                      },
                      {
                        label: person.contacts.email,
                        href: formatContactHref("mailto", person.contacts.email),
                      },
                      {
                        label: person.contacts.emailPrivate,
                        href: formatContactHref("mailto", person.contacts.emailPrivate),
                      },
                    ]
                      .filter((item) => item.label && item.href)
                      .slice(0, 4)
                      .map((item) => (
                        <a
                          key={`${person.id}-${item.href}`}
                          href={item.href!}
                          className="inline-flex max-w-full items-center rounded border px-2 py-0.5 text-xs text-primary hover:bg-muted"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="truncate">{item.label}</span>
                        </a>
                      ))}
                    {![
                      person.contacts.phoneWork,
                      person.contacts.phonePrivate,
                      person.contacts.email,
                      person.contacts.emailPrivate,
                    ].some(Boolean) && (
                      <p className="text-xs text-muted-foreground">
                        Keine oeffentlichen Kontaktdaten
                      </p>
                    )}
                  </div>

                  <div className="mt-2 space-y-1">
                    {personPreviewLoadingIds.includes(person.id) && (
                      <p className="text-xs text-muted-foreground">
                        Vorschau wird geladen…
                      </p>
                    )}
                    {personPreviewById[person.id] === null &&
                      !personPreviewLoadingIds.includes(person.id) && (
                        <p className="text-xs text-muted-foreground">
                          Vorschau konnte nicht geladen werden.
                        </p>
                      )}
                    {personPreviewById[person.id] && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Dienste (14 Tage):{" "}
                          {personPreviewById[person.id]?.duties
                            .slice(0, 3)
                            .map((duty) => `${duty.date} ${duty.serviceType}`)
                            .join(" • ") || "Keine"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Arbeitsplaetze:{" "}
                          {Array.from(
                            new Set(
                              (personPreviewById[person.id]?.workplaces ?? [])
                                .map((entry) => entry.workplace)
                                .filter(Boolean),
                            ),
                          )
                            .slice(0, 4)
                            .join(", ") || "Keine"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Abwesenheiten:{" "}
                          {personPreviewById[person.id]?.visibility.absences
                            ? personPreviewById[person.id]?.absences.length
                              ? personPreviewById[person.id]?.absences
                                  .slice(0, 2)
                                  .map(
                                    (a) =>
                                      `${a.startDate}${
                                        a.endDate !== a.startDate
                                          ? ` bis ${a.endDate}`
                                          : ""
                                      } (${a.reason})`,
                                  )
                                  .join(" • ")
                              : "Keine"
                            : "Keine Berechtigung"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(
            [
              ["SOPs", headerSearchResults.groups.sops],
              ["Videos", headerSearchResults.groups.videos],
              ["PowerPoints", headerSearchResults.groups.presentations],
            ] as const
          ).map(([label, items]) =>
            items.length ? (
              <div key={label} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {label}
                </p>
                {items.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted"
                    onClick={() => navigateFromSearch(item.url)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {item.title}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {item.type === "sop"
                          ? "Wissen"
                          : item.type === "video"
                            ? "Video"
                            : "Praes."}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                      {item.createdByLabel
                        ? ` • Erstellt von ${item.createdByLabel}`
                        : ""}
                    </p>
                    {item.keywords.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.keywords.slice(0, 4).join(", ")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <header
        className="min-h-16 kabeg-header sticky top-0 z-30 px-4 md:px-6 pt-[env(safe-area-inset-top)] flex items-center justify-between shadow-sm"
      >
      <div className="flex items-center gap-2 min-w-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex rounded-full text-white/80 hover:text-white hover:bg-white/10"
          onClick={onToggleDesktopSidebar}
          aria-label={desktopSidebarCollapsed ? "Menü einblenden" : "Menü ausblenden"}
          data-testid="button-desktop-sidebar-toggle"
        >
          {desktopSidebarCollapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full text-white/80 hover:text-white hover:bg-white/10 relative z-40"
          onClick={onToggleMobileNav}
          disabled={!onToggleMobileNav}
          aria-label="Menü öffnen"
          data-testid="button-mobile-menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        {title ? (
          <h2 className="text-xl font-semibold text-white tracking-tight truncate">
            {title}
          </h2>
        ) : null}
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full text-white/80 hover:text-white hover:bg-white/10"
          aria-label="Suche öffnen"
          onClick={() => setMobileSearchOpen((prev) => !prev)}
          data-testid="button-mobile-search"
        >
          {mobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </Button>

        <div ref={searchBoxRef} className="relative w-80 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/60" />
          <Input
            placeholder="Suchen..."
            value={headerSearchQuery}
            onFocus={() => {
              if (
                headerSearchQuery.trim().length >= 2 ||
                headerSearchLoading ||
                headerSearchError
              ) {
                setHeaderSearchOpen(true);
              }
            }}
            onChange={(event) => setHeaderSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setHeaderSearchOpen(false);
              }
            }}
            className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30"
            data-testid="input-search"
          />
          {headerSearchOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[34rem] max-w-[80vw] rounded-xl border bg-background p-3 shadow-xl">
              {renderSearchResults("max-h-[26rem]")}
            </div>
          )}
        </div>

        {isAdminActual && !viewAsUser && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex gap-2 text-white/80 hover:text-white hover:bg-white/10"
              >
                <Users className="w-4 h-4" />
                <span>{onlineCount}</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-56">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Online ({onlineCount})
              </p>
              {onlineCount === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">
                  Keine aktiven Benutzer
                </p>
              ) : (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {onlineUsers.map((user) => (
                    <p key={user.id} className="text-sm">
                      {formatOnlineUserDisplayName(user)}
                    </p>
                  ))}
                </div>
              )}
            </HoverCardContent>
          </HoverCard>
        )}

        {canUseViewAsUserToggle && (
          <div className="hidden md:flex items-center gap-2 text-white/80">
            <span className="text-xs">Ansicht</span>
            <Select
              value={viewMode}
              onValueChange={(value) =>
                setViewMode(value as "default" | "user" | "trainer")
              }
            >
              <SelectTrigger className="h-8 w-36 border-white/20 bg-white/10 text-white">
                <SelectValue placeholder="Ansicht" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Standard</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="trainer">Ausbilder</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="hidden md:flex gap-2 text-white/80 hover:text-white hover:bg-white/10"
        >
          <Calendar className="w-4 h-4" />
          <span>{today}</span>
        </Button>
      </div>
      </header>

      {mobileSearchOpen && (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-40 px-3 md:hidden">
          <div className="rounded-xl border bg-background p-3 shadow-xl">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Suchen..."
                value={headerSearchQuery}
                onChange={(event) => setHeaderSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setMobileSearchOpen(false);
                  }
                }}
                className="pl-9"
                data-testid="input-search-mobile"
              />
            </div>
            {renderSearchResults("max-h-[55vh]")}
          </div>
        </div>
      )}
    </>
  );
}
