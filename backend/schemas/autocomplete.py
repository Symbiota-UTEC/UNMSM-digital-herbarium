from pydantic import BaseModel
from typing import List, Optional


class SuggestionList(BaseModel):
    items: List[str]


class ScientificNameSuggestion(BaseModel):
    scientificName: str
    taxonID: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None


class ScientificNameSuggestionList(BaseModel):
    items: List[ScientificNameSuggestion]
