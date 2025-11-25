from backend.schemas.common.pages import Page
from backend.schemas.collections import CollectionOut
from backend.schemas.occurrence import OccurrenceOut
from backend.schemas.institutions import InstitutionOut

CollectionsPage = Page[CollectionOut]
OccurrencesPage = Page[OccurrenceOut]
InstitutionsPage = Page[InstitutionOut]

__all__ = ["Page", "CollectionsPage", "OccurrencesPage", "InstitutionsPage"]
