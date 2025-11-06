import re
from typing import Dict

DWC_HEADER_RE = re.compile(
    r"^dwc:(Occurrence|Event|Location|Taxon|ResourceRelationship):([A-Za-z_][A-Za-z0-9_]*)$"
)

ALLOWED_FIELDS: Dict[str, set] = {
    "Occurrence": {
        "occurrenceID",
        "catalogNumber",
        "recordNumber",
        "recordedBy",
        "recordEnteredBy",
        "individualCount",
        "occurrenceStatus",
        "preparations",
        "disposition",
        "occurrenceRemarks",
        "modified",
        "license",
        "rightsHolder",
        "accessRights",
        "bibliographicCitation",
    },
    "Event": {
        "eventDate",
        "year", "month", "day",
        "verbatimEventDate",
        "fieldNumber",
        "samplingProtocol", "samplingEffort",
        "habitat",
        "eventRemarks",
    },
    "Location": {
        "stateProvince",
        "county",
        "municipality",
        "locality",
        "verbatimLocality",
        "decimalLatitude",
        "decimalLongitude",
        "geodeticDatum",
        "coordinateUncertaintyInMeters",
        "coordinatePrecision",
        "minimumElevationInMeters",
        "maximumElevationInMeters",
        "verbatimElevation",
    },
    "Taxon": {
        "scientificName",
        "scientificNameAuthorship",
        "family",
        "genus",
        "specificEpithet",
        "infraspecificEpithet",
        "taxonRank",
        "acceptedNameUsage",
    },
    "ResourceRelationship": {
        "relatedResourceID",
    },
}
