"""Read-only taxon resolution shared by imports and individual lookups."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.models.enums import TaxonMatchReason, TaxonMatchStatus
from backend.models.models import Taxon


@dataclass(frozen=True)
class TaxonMatchResult:
    status: TaxonMatchStatus
    reason: TaxonMatchReason
    taxon: Optional[Taxon] = None
    candidateCount: int = 0
    usedAuthorshipFallback: bool = False
    usedCaseInsensitiveFallback: bool = False


def match_taxon(
    db: Session, scientific_name: Optional[str], authorship: Optional[str] = None
) -> TaxonMatchResult:
    """Resolve an existing taxon, preferring exact matches before ignoring case.

    candidateCount describes the query's candidates before preference filtering.
    Authorship is ignored only if exact and case-insensitive authorship queries
    find no candidates. Multiple candidates are narrowed by current,
    Accepted/Valid, then nonempty tplID. Case fallback describes the query that
    supplied candidates, not unsuccessful attempts.
    This function never creates taxa or modifies identifications.
    """
    scientific_name = (scientific_name or "").strip()
    authorship = (authorship or "").strip()
    if not scientific_name:
        return TaxonMatchResult(TaxonMatchStatus.MISSING_NAME, TaxonMatchReason.MISSING_NAME)

    fallback = False
    case_fallback = False
    for ignore_authorship, ignore_case in (
        (False, False),
        (False, True),
        (True, False),
        (True, True),
    ):
        name_filter = (
            func.lower(Taxon.scientificName) == func.lower(scientific_name)
            if ignore_case
            else Taxon.scientificName == scientific_name
        )
        query = select(Taxon).where(name_filter)
        if not ignore_authorship:
            if authorship:
                query = query.where(
                    func.lower(Taxon.scientificNameAuthorship) == func.lower(authorship)
                    if ignore_case
                    else Taxon.scientificNameAuthorship == authorship
                )
            else:
                query = query.where(
                    or_(
                        Taxon.scientificNameAuthorship.is_(None),
                        Taxon.scientificNameAuthorship == "",
                    )
                )
        # Also suppress autoflush for callers that have pending ORM changes.
        fallback = ignore_authorship
        candidates = db.execute(query.execution_options(autoflush=False)).scalars().all()
        if candidates:
            case_fallback = ignore_case
            break

    count = len(candidates)

    def matched(taxon: Taxon, reason: TaxonMatchReason) -> TaxonMatchResult:
        return TaxonMatchResult(
            TaxonMatchStatus.MATCHED, reason, taxon, count, fallback, case_fallback
        )

    if not candidates:
        return TaxonMatchResult(
            TaxonMatchStatus.NOT_FOUND,
            TaxonMatchReason.NO_CANDIDATES,
            usedAuthorshipFallback=fallback,
        )
    if count == 1:
        return matched(candidates[0], TaxonMatchReason.UNIQUE_CANDIDATE)

    current = candidates
    current_only = [taxon for taxon in current if taxon.isCurrent]
    if len(current_only) == 1:
        return matched(current_only[0], TaxonMatchReason.UNIQUE_CURRENT)
    if current_only:
        current = current_only

    accepted_valid = [
        taxon
        for taxon in current
        if taxon.taxonomicStatus == "Accepted" and taxon.nomenclaturalStatus == "Valid"
    ]
    if len(accepted_valid) == 1:
        return matched(accepted_valid[0], TaxonMatchReason.UNIQUE_ACCEPTED_VALID)
    if accepted_valid:
        current = accepted_valid

    with_tpl_id = [taxon for taxon in current if taxon.tplID]
    if len(with_tpl_id) == 1:
        return matched(with_tpl_id[0], TaxonMatchReason.UNIQUE_TPL_ID)
    return TaxonMatchResult(
        TaxonMatchStatus.AMBIGUOUS,
        TaxonMatchReason.MULTIPLE_CANDIDATES,
        candidateCount=count,
        usedAuthorshipFallback=fallback,
        usedCaseInsensitiveFallback=case_fallback,
    )
