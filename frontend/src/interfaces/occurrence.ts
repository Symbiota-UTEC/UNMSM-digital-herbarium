export interface OccurrenceBriefItem {
  occurrenceId: string;
  code: string | null;
  scientificName: string | null;
  family: string | null;
  location: string | null;
  collector: string | null;
  date: string | null;
}

export interface CollectionSummary {
  collectionId: string;
  collectionName: string | null;
  institutionId: string | null;
}

export interface OccurrenceIdentifierOut {
  identifierId: string;
  fullName: string | null;
  orcID: string | null;
}

export interface OccurrenceTaxonOut {
  taxonId: string;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  family: string | null;
  genus: string | null;
  specificEpithet: string | null;
  infraspecificEpithet: string | null;
  taxonRank: string | null;
}

export interface OccurrenceIdentificationOut {
  identificationId: string;
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
  occurrenceImageId: string;
  imagePath: string;
  fileSize: number | null;
  photographer: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Detalle de ocurrencia (flatten) ----

export interface OccurrenceItem {
  occurrenceId: string;

  // Relaciones básicas
  collectionId: string | null;
  collection: CollectionSummary | null;
  digitizerUserId: string | null;

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
  verbatimElevation: string | null;

  countryCode: string | null;
  hydrographicContext: string | null;
  footprintWKT: string | null;

  // Datos biológicos / occurrence extra
  organismQuantity: string | null;
  organismQuantityType: string | null;
  georeferenceVerificationStatus: string | null;

  habitat: string | null;
  eventRemarks: string | null;
  occurrenceStatus: string | null;
  occurrenceRemarks: string | null;
  lifeStage: string | null;
  establishmentMeans: string | null;
  associatedReferences: string | null;
  associatedTaxa: string | null;

  dynamicProperties: Record<string, any> | null;

  // Proyecto / financiamiento
  fieldNotes: string | null;
  // Trazabilidad
  createdAt: string;
  updatedAt: string;

  // Relaciones
  identifications: OccurrenceIdentificationOut[];
  currentIdentificationId: string | null;
  currentIdentification: OccurrenceIdentificationOut | null;
  images: OccurrenceImageOut[];
}
