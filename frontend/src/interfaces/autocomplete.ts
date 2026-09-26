export interface ScientificNameSuggestion {
  scientificName: string;
  taxonId: string | null;
  wfoTaxonId: string | null;
  scientificNameAuthorship?: string | null;
}
