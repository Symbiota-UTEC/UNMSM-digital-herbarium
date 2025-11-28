from pydantic import BaseModel
from typing import List

class SuggestionList(BaseModel):
    items: List[str]
