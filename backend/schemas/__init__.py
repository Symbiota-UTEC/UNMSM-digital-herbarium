from backend.schemas.collections import CollectionOut
from backend.schemas.common.pages import Page
from backend.schemas.institutions import InstitutionOut
from backend.schemas.occurrence import OccurrenceOut

CollectionsPage = Page[CollectionOut]
OccurrencesPage = Page[OccurrenceOut]
InstitutionsPage = Page[InstitutionOut]

__all__ = ["Page", "CollectionsPage", "OccurrencesPage", "InstitutionsPage"]
