export interface TaxonSynonym {
  taxonId: string;
  wfoTaxonId: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  taxonomicStatus: string | null;
}

export interface TaxonTreeNode {
  taxonId: string;
  wfoTaxonId: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  fullName: string | null;
  taxonRank: string | null;
  parentNameUsageID: string | null;
  acceptedNameUsageID: string | null;
  taxonomicStatus: string | null;
  isCurrent: boolean;
  hasChildren: boolean;
  synonyms: TaxonSynonym[];
}

export interface TaxonSearchItem {
  taxonId: string;
  wfoTaxonId: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  taxonRank: string | null;
  taxonomicStatus: string | null;
  family: string | null;
  isCurrent: boolean;
  occurrenceCount: number;
}

export interface TaxonIdentifierOut {
  identifierId: string;
  fullName: string | null;
  orcID: string | null;
}

export interface TaxonIdentificationOut {
  identificationId: string;
  taxonId: string;
  occurrenceId: string;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  institution: string | null;
  dateIdentified: string | null;
  isCurrent: boolean;
  identificationVerificationStatus: string | null;
  typeStatus: string | null;
  identifiers: TaxonIdentifierOut[];
  createdAt: string;
  updatedAt: string;
}

export interface TaxonDetailOut {
  taxonId: string;
  scientificNameID: string | null;
  localID: string | null;
  scientificName: string | null;
  taxonRank: string | null;
  parentNameUsageID: string | null;
  scientificNameAuthorship: string | null;
  family: string | null;
  subfamily: string | null;
  tribe: string | null;
  subtribe: string | null;
  genus: string | null;
  subgenus: string | null;
  specificEpithet: string | null;
  infraspecificEpithet: string | null;
  verbatimTaxonRank: string | null;
  nomenclaturalStatus: string | null;
  namePublishedIn: string | null;
  taxonomicStatus: string | null;
  acceptedNameUsageID: string | null;
  originalNameUsageID: string | null;
  nameAccordingToID: string | null;
  taxonRemarks: string | null;
  created: string | null;
  modified: string | null;
  references: string | null;
  source: string | null;
  majorGroup: string | null;
  tplID: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}
