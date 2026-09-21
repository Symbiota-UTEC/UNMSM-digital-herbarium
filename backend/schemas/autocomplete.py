from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class SuggestionList(BaseModel):
    items: List[str]


class ScientificNameSuggestion(BaseModel):
    scientificName: str
    taxonId: Optional[UUID] = None
    wfoTaxonId: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None


class ScientificNameSuggestionList(BaseModel):
    items: List[ScientificNameSuggestion]
