export interface OccurrenceBriefItem {
    id: number;
    code: string | null;
    scientific_name: string | null;
    family: string | null;
    location: string | null;
    collector: string | null;
    date: string | null;
}


export interface CollectionSummary {
    id: number;
    collectionCode: string | null;
    collectionName: string | null;
    institution_id: number | null;
}

export interface EventOut {
    id: number;
    eventDate: string | null;
    year: number | null;
    month: number | null;
    day: number | null;
    verbatimEventDate: string | null;
    fieldNumber: string | null;
    samplingProtocol: string | null;
    samplingEffort: string | null;
    habitat: string | null;
    eventRemarks: string | null;
}

export interface LocationOut {
    id: number;
    stateProvince: string | null;
    county: string | null;
    municipality: string | null;
    locality: string | null;
    verbatimLocality: string | null;
    decimalLatitude: number | null;
    decimalLongitude: number | null;
    geodeticDatum: string | null;
    coordinateUncertaintyInMeters: number | null;
    coordinatePrecision: number | null;
    minimumElevationInMeters: number | null;
    maximumElevationInMeters: number | null;
    verbatimElevation: string | null;
}

export interface TaxonOut {
    id: number;
    scientificName: string | null;
    scientificNameAuthorship: string | null;
    family: string | null;
    genus: string | null;
    specificEpithet: string | null;
    infraspecificEpithet: string | null;
    taxonRank: string | null;
    acceptedNameUsage: string | null;
}

export interface OccurrenceItem {
    id: number;

    occurrenceID: string | null;
    catalogNumber: string | null;
    recordNumber: string | null;
    recordedBy: string | null;
    recordEnteredBy: string | null;
    individualCount: number | null;
    occurrenceStatus: string | null;
    preparations: string | null;
    disposition: string | null;
    occurrenceRemarks: string | null;

    modified: string | null;

    license: string | null;
    rightsHolder: string | null;
    accessRights: string | null;
    bibliographicCitation: string | null;

    collection: CollectionSummary | null;
    event: EventOut | null;
    location: LocationOut | null;
    taxon: TaxonOut | null;
}
