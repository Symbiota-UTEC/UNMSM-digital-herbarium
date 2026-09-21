from math import ceil
from typing import Generic, List, Sequence, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    limit: int
    offset: int
    currentPage: int
    totalPages: int
    remainingPages: int

    @classmethod
    def of(
        cls,
        items: Sequence[T],
        *,
        total: int,
        limit: int,
        offset: int,
    ) -> "Page[T]":
        """Sin clamping: un offset más allá del final se refleja tal cual en
        currentPage. Con limit <= 0 devuelve una página vacía en vez de
        dividir por cero."""
        if limit <= 0:
            return cls(
                items=list(items),
                total=total,
                limit=limit,
                offset=offset,
                currentPage=1,
                totalPages=0,
                remainingPages=0,
            )

        total_pages = ceil(total / limit) if total > 0 else 0
        current_page = (offset // limit) + 1
        remaining_pages = max(total_pages - current_page, 0)

        return cls(
            items=list(items),
            total=total,
            limit=limit,
            offset=offset,
            currentPage=current_page,
            totalPages=total_pages,
            remainingPages=remaining_pages,
        )
