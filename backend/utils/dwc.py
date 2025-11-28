import re
from typing import Dict, Set

DWC_HEADER_RE = re.compile(
    r"^dwc:(Occurrence|Event|Location|Taxon|Identification):([A-Za-z_][A-Za-z0-9_]*)$"
)

ALLOWED_FIELDS: Dict[str, Set[str]] = {
    # ------------------------------------------------------------------
    # DwC: Occurrence (solo campos que realmente tienes en tu modelo)
    # ------------------------------------------------------------------
    "Occurrence": {
        # Core obligatorios en tu modelo
        "catalogNumber",
        "recordNumber",
        "recordedBy",
        "recordedByID",  # IDs de colectores (ORCID/URI), alineados con recordedBy

        # Nice to have
        "organismQuantity",
        "organismQuantityType",
        "georeferenceVerificationStatus",
        "otherCatalogNumbers",
        "occurrenceRemarks",
        "lifeStage",
        "establishmentMeans",
        "associatedReferences",
        "associatedTaxa",

        # Extras / extensión
        "dynamicProperties",
        "projectTitle",
        "projectID",
        "fundingAttribution",
        "fundingAttributionID",
    },

    # ------------------------------------------------------------------
    # DwC: Event (se mapean a campos de Occurrence aplanado)
    # ------------------------------------------------------------------
    "Event": {
        "eventDate",
        "year",
        "month",
        "day",
        "verbatimEventDate",
        "fieldNumber",
        "samplingProtocol",
        "samplingEffort",
        "habitat",
        "eventRemarks",
        "sampleSizeValue",
        "sampleSizeUnit",
        "fieldNotes",
        "projectID",
        "projectTitle",
    },

    # ------------------------------------------------------------------
    # DwC: Location (también mapean a Occurrence aplanado)
    # ------------------------------------------------------------------
    "Location": {
        "country",
        "stateProvince",
        "county",
        "municipality",
        "locality",
        "verbatimLocality",
        "locationRemarks",
        "decimalLatitude",
        "decimalLongitude",
        "countryCode",
        "georeferencedBy",
        "georeferenceRemarks",
        "minimumElevationInMeters",
        "maximumElevationInMeters",
        "verbatimElevation",
        "verbatimCoordinateSystem",
        "hydrographicContext",
        "footprintWKT",
    },

    # ------------------------------------------------------------------
    # DwC: Taxon
    #  - Para carga via CSV SOLO usarás scientificName + scientificNameAuthorship
    #    para resolver taxonId contra tu tabla Taxon (backbone WFO).
    # ------------------------------------------------------------------
    "Taxon": {
        "scientificName",
        "scientificNameAuthorship",
    },

    # ------------------------------------------------------------------
    # DwC: Identification (para identificadores múltiples)
    # ------------------------------------------------------------------
    "Identification": {
        "identifiedBy",    # texto, lista separada por comas (OBLIGATORIO)
        "identifiedByID",  # IDs (ORCID/URI/etc) en el mismo orden, separados por comas
        "dateIdentified",
        "isCurrent",
        "isVerified",
        "typeStatus",
    },
}
