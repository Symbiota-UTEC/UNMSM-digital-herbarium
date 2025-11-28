export interface OccurrenceBriefItem {
  id: number;
  code: string | null;
  scientificName: string | null;
  family: string | null;
  location: string | null;
  collector: string | null;
  date: string | null;
}

export interface CollectionSummary {
  id: number;
  collectionCode: string | null;
  collectionName: string | null;
  institutionId: number | null;
}

export interface OccurrenceAgentOut {
  id: number;
  fullName: string | null;
  orcID: string | null;
}

export interface OccurrenceIdentifierOut {
  id: number;
  fullName: string | null;
  orcID: string | null;
}

export interface OccurrenceTaxonOut {
  id: number;
  taxonId: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  family: string | null;
  genus: string | null;
  specificEpithet: string | null;
  infraspecificEpithet: string | null;
  taxonRank: string | null;
}

export interface OccurrenceIdentificationOut {
  id: number;
  identifiedBy: string | null;
  dateIdentified: string | null;
  isCurrent: boolean;
  isVerified: boolean;
  typeStatus: string | null;

  scientificName: string | null;
  scientificNameAuthorship: string | null;

  taxon: OccurrenceTaxonOut | null;
  identifiers: OccurrenceIdentifierOut[];

  createdAt: string;
  updatedAt: string;
}

export interface OccurrenceImageOut {
  id: number;
  imagePath: string;
  fileSize: number | null;
  photographer: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Detalle de ocurrencia (flatten) ----

export interface OccurrenceItem {
  id: number;

  // Relaciones básicas
  collectionId: number | null;
  collection: CollectionSummary | null;
  digitizerUserId: number | null;

  // Occurrence core
  recordNumber: string | null;
  recordedBy: string | null;
  catalogNumber: string | null;

  // Evento
  verbatimEventDate: string | null;
  eventDate: string | null;
  year: number | null;
  month: number | null;
  day: number | null;

  // Localización
  country: string | null;
  stateProvince: string | null;
  county: string | null;
  municipality: string | null;
  locality: string | null;
  verbatimLocality: string | null;
  locationRemarks: string | null;

  decimalLatitude: number | null;
  decimalLongitude: number | null;
  georeferencedBy: string | null;
  georeferenceRemarks: string | null;
  verbatimElevation: string | null;
  minimumElevationInMeters: number | null;
  maximumElevationInMeters: number | null;

  countryCode: string | null;
  verbatimCoordinateSystem: string | null;
  hydrographicContext: string | null;
  footprintWKT: string | null;

  // Datos biológicos / occurrence extra
  organismQuantity: string | null;
  organismQuantityType: string | null;
  georeferenceVerificationStatus: string | null;
  otherCatalogNumbers: string | null;

  habitat: string | null;
  eventRemarks: string | null;
  occurrenceRemarks: string | null;
  lifeStage: string | null;
  establishmentMeans: string | null;
  associatedReferences: string | null;
  associatedTaxa: string | null;

  dynamicProperties: Record<string, any> | null;

  // Proyecto / financiamiento
  projectTitle: string | null;
  sampleSizeValue: number | null;
  sampleSizeUnit: string | null;
  fieldNotes: string | null;
  projectID: string | null;
  fundingAttribution: string | null;
  fundingAttributionID: string | null;

  // Trazabilidad
  createdAt: string;
  updatedAt: string;

  // Relaciones
  agents: OccurrenceAgentOut[];
  identifications: OccurrenceIdentificationOut[];
  currentIdentificationId: number | null;
  currentIdentification: OccurrenceIdentificationOut | null;
  images: OccurrenceImageOut[];
}
