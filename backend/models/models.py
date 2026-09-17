"""
Modelos SQLAlchemy 2.0 para Darwin Core (DwC) con núcleo Occurrence.

Las clases viven en módulos separados por dominio (institution.py,
collection.py, user.py, registration_request.py, taxon.py, occurrence.py,
identification.py, upload_jobs.py); este archivo las reexporta todas para
que `from backend.models.models import ...` siga funcionando, y define al
final los índices que combinan columnas de varios modelos (deben ir después
de importar todas las clases involucradas).
"""
from __future__ import annotations

from sqlalchemy import Index, func

from backend.config.database import Base

from backend.models.institution import Institution
from backend.models.collection import Collection, CollectionPermission
from backend.models.registration_request import RegistrationRequest
from backend.models.taxon import Taxon
from backend.models.occurrence import Occurrence, OccurrenceImage
from backend.models.identification import Identification, Identifier
from backend.models.user import User
from backend.models.upload_jobs import TaxonFloraImportJob
from backend.models.country import Country
from backend.models.admin_division import AdminDivision

__all__ = [
    "Base",
    "Institution",
    "Collection",
    "CollectionPermission",
    "RegistrationRequest",
    "Taxon",
    "Occurrence",
    "OccurrenceImage",
    "Identification",
    "Identifier",
    "User",
    "TaxonFloraImportJob",
    "Country",
    "AdminDivision",
]

Index("ix_identification_occurrence_current", Identification.occurrenceId, Identification.isCurrent)

# Una sola identificación vigente por ocurrencia: índice único parcial
# (no puede ser DEFERRABLE, así que los servicios deben demotar antes de promover).
Index(
    "uq_identification_one_current_per_occurrence",
    Identification.occurrenceId,
    unique=True,
    postgresql_where=Identification.isCurrent,
)

Index("ix_occurrence_latlon", Occurrence.decimalLatitude, Occurrence.decimalLongitude)
Index("ix_occurrence_catalog", Occurrence.catalogNumber, Occurrence.collectionId)
Index("ix_occurrence_event_date", Occurrence.year, Occurrence.month, Occurrence.day)
Index("ix_taxon_name_auth_rank", Taxon.scientificName, Taxon.scientificNameAuthorship, Taxon.taxonRank)

Index(
    "ix_taxon_scientific_name_unaccent_trgm",
    func.unaccent_immutable(func.lower(Taxon.scientificName)).label(
        "scientific_name_unaccent"
    ),
    postgresql_using="gin",
    postgresql_ops={"scientific_name_unaccent": "gin_trgm_ops"},
)

Index(
    "ix_taxon_family_unaccent",
    func.unaccent_immutable(func.lower(Taxon.family)),
)

Index(
    "ix_institution_name_unaccent",
    func.unaccent_immutable(func.lower(Institution.institutionName)),
)

Index(
    "ix_occurrence_recordedby_unaccent",
    func.unaccent_immutable(func.lower(Occurrence.recordedBy)),
)

Index(
    "ix_occurrence_location_unaccent",
    func.unaccent_immutable(
        func.lower(
            func.coalesce(
                Occurrence.locality,
                Occurrence.municipality,
                Occurrence.stateProvince,
                Occurrence.country,
            )
        )
    ),
)
