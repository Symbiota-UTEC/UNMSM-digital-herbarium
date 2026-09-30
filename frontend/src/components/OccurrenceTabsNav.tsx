import {
  OCCURRENCE_TABS as TABS,
  OCCURRENCE_TAB_ICONS as TAB_ICONS,
  TAB_STATUS_META,
  type OccurrenceTabKey,
  type TabCompletionStatus,
} from "@constants/occurrenceTabs";

interface OccurrenceTabsNavProps {
  activeTab: OccurrenceTabKey;
  onTabChange: (key: OccurrenceTabKey) => void;
  statuses: Record<OccurrenceTabKey, TabCompletionStatus>;
}

/** Barra de pestañas compartida entre el formulario (NewOccurrencePage) y el detalle
 * (OccurrenceDetailPage): mismo ícono por pestaña y mismo indicador de estado (obligatorio
 * faltante / incompleto / completo), para que ambas vistas de una ocurrencia se vean iguales
 * y no vuelvan a desincronizarse cuando una de las dos cambie. */
export function OccurrenceTabsNav({ activeTab, onTabChange, statuses }: OccurrenceTabsNavProps) {
  return (
    <div className="mb-6">
      <div className="flex gap-1.5 bg-muted rounded-xl p-1.5 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.key];
          const status = TAB_STATUS_META[statuses[tab.key]];
          const StatusIcon = status.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={[
                "flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 text-sm whitespace-nowrap rounded-lg transition-all duration-200",
                activeTab === tab.key
                  ? "bg-white text-[rgb(117,26,29)] font-semibold shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span title={status.title} className="inline-flex">
                <StatusIcon className="h-3.5 w-3.5" style={{ color: status.color }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
