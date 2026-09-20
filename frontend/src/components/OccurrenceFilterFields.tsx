import { useAuth } from "@contexts/AuthContext";
import {
  FilterAutocompleteInput,
  FilterDateRangePicker,
  useAutocomplete,
  useScientificNameAutocomplete,
  filterInputClass,
  filterLabelClass,
} from "./ui/filters";

export type OccurrenceFilterValues = {
  code: string;
  scientificName: string;
  family: string;
  institution: string;
  location: string;
  collector: string;
  dateFrom: string;
  dateTo: string;
};

export const EMPTY_OCCURRENCE_FILTERS: OccurrenceFilterValues = {
  code: "",
  scientificName: "",
  family: "",
  institution: "",
  location: "",
  collector: "",
  dateFrom: "",
  dateTo: "",
};

export const hasActiveOccurrenceFilters = (filters: OccurrenceFilterValues) =>
  Object.values(filters).some(Boolean);

type Props = {
  values: OccurrenceFilterValues;
  onChange: (values: OccurrenceFilterValues) => void;
};

/** Campos de "Filtrar ocurrencias", compartidos por el listado y el mapa. */
export function OccurrenceFilterFields({ values, onChange }: Props) {
  const { apiFetch } = useAuth();
  const set = (patch: Partial<OccurrenceFilterValues>) => onChange({ ...values, ...patch });

  const { items: sciNameSuggestions, loading: sciNameLoading } =
    useScientificNameAutocomplete(apiFetch, values.scientificName);
  const { items: familySuggestions, loading: familyLoading } =
    useAutocomplete(apiFetch, "family", values.family);
  const { items: institutionSuggestions, loading: institutionLoading } =
    useAutocomplete(apiFetch, "institution", values.institution, { minChars: 1 });
  const { items: locationSuggestions, loading: locationLoading } =
    useAutocomplete(apiFetch, "location", values.location);
  const { items: collectorSuggestions, loading: collectorLoading } =
    useAutocomplete(apiFetch, "collector", values.collector);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <div className="flex flex-col gap-1">
        <label className={filterLabelClass}>Código (exacto)</label>
        <input
          className={filterInputClass}
          placeholder="Ej. 280687"
          value={values.code}
          onChange={(e) => set({ code: e.target.value })}
        />
      </div>

      <FilterAutocompleteInput
        label="Nombre científico"
        placeholder="Ej. Lycopersicon hirsutum"
        value={values.scientificName}
        onChange={(v) => set({ scientificName: v })}
        suggestions={sciNameSuggestions}
        loading={sciNameLoading}
      />

      <FilterAutocompleteInput
        label="Familia"
        placeholder="Ej. Solanaceae"
        value={values.family}
        onChange={(v) => set({ family: v })}
        suggestions={familySuggestions}
        loading={familyLoading}
      />

      <FilterAutocompleteInput
        label="Institución"
        placeholder="Ej. San Marcos"
        value={values.institution}
        onChange={(v) => set({ institution: v })}
        suggestions={institutionSuggestions}
        loading={institutionLoading}
        minChars={1}
      />

      <FilterAutocompleteInput
        label="Localidad"
        placeholder="Ej. Cajamarca"
        value={values.location}
        onChange={(v) => set({ location: v })}
        suggestions={locationSuggestions}
        loading={locationLoading}
      />

      <FilterAutocompleteInput
        label="Colector"
        placeholder="Ej. Antonio Raimondi"
        value={values.collector}
        onChange={(v) => set({ collector: v })}
        suggestions={collectorSuggestions}
        loading={collectorLoading}
      />

      <div className="md:col-span-2 lg:col-span-2">
        <FilterDateRangePicker
          from={values.dateFrom}
          to={values.dateTo}
          onFromChange={(v) => set({ dateFrom: v })}
          onToChange={(v) => set({ dateTo: v })}
        />
      </div>
    </div>
  );
}
