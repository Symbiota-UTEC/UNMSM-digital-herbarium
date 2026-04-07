# backend/routers/upload.py
from __future__ import annotations

import csv
import io
import json
import logging
import requests
import uuid

from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import select, exists, or_, update
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect
from datetime import datetime

from backend.config.database import get_db, SessionLocal
from backend.config.settings import seaweedfs_internal_url, seaweedfs_public_url
from backend.auth.jwt import get_current_user, require_superuser
from backend.models.models import (
    User,
    Collection,
    CollectionPermission,
    Occurrence,
    Taxon,
    Agent,
    Identifier,
    Identification,
    OccurrenceAgent,
    IdentificationIdentifier,
    OccurrenceImage,
)

from backend.utils.dwc import (
    DWC_HEADER_RE,
    ALLOWED_FIELDS,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["Files"],
)

# ----------------------------
# Helpers claves / parsing
# ----------------------------

def _taxon_key(scientific_name: str, authorship: Optional[str]) -> Tuple[str, str]:
    """Clave simple para Taxon dentro de ESTA carga."""
    return (scientific_name or "", authorship or "")


def _strict_parse_headers(headers: List[str]) -> Dict[Tuple[str, str], int]:
    """
    Valida que TODOS los headers cumplan dwc:Entity:field y que field esté permitido.
    Devuelve un mapa {(Entity, field) -> index}.
    Si hay cualquier columna inválida o field no permitido, lanza ValueError.
    """
    errors: List[str] = []
    mapping: Dict[Tuple[str, str], int] = {}

    for idx, h in enumerate(headers):
        m = DWC_HEADER_RE.match(h.strip())
        if not m:
            errors.append(f"Header inválido: '{h}' (se requiere 'dwc:Entity:field')")
            continue

        entity, field = m.group(1), m.group(2)

        allowed = ALLOWED_FIELDS.get(entity)
        if not allowed:
            errors.append(f"Entity no soportada: '{entity}' en header '{h}'")
            continue

        if field not in allowed:
            errors.append(
                f"Field no permitido para {entity}: '{field}' (header '{h}')"
            )
            continue

        mapping[(entity, field)] = idx

    if errors:
        # Señala todas las columnas problemáticas de una vez
        raise ValueError("Error en headers del CSV:\n- " + "\n- ".join(errors))

    return mapping


def _clean_value(v: str) -> Optional[str]:
    v = (v or "").strip()
    return v if v != "" else None


def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(float(v))
    except Exception:
        return None


def _to_float(v: Optional[str]) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _to_json_value(v: Optional[str]) -> Any:
    """
    Intenta parsear JSON. Si falla, retorna el string original (válido como JSON string).
    Preferimos objetos/dicts para dynamicProperties, pero aceptamos cualquier JSON válido.
    """
    if v is None:
        return None
    try:
        return json.loads(v)
    except Exception:
        # Guarda la cadena tal cual; SQLAlchemy JSON la serializa como string JSON.
        return v


def _to_bool(v: Optional[str]) -> Optional[bool]:
    if v is None:
        return None
    vv = v.strip().lower()
    if vv in {"1", "true", "t", "yes", "y", "si", "sí"}:
        return True
    if vv in {"0", "false", "f", "no", "n"}:
        return False
    return None


def _split_list(v: Optional[str]) -> List[str]:
    """Separa por comas y limpia espacios; ignora entradas vacías."""
    if not v:
        return []
    return [part.strip() for part in v.split(",") if part.strip()]


# =========================
# Helpers de autorización
# =========================

def _user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Regla de edición:
    - superuser: acceso
    - permiso explícito con rol editor/owner: acceso
    - admin de institución y misma institución: acceso
    """
    if user.isSuperuser:
        return True

    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collectionId == collection.id)
                & (CollectionPermission.userId == user.id)
                & (CollectionPermission.role.in_(["editor", "owner"]))
            )
        )
    )
    if perm_exists:
        return True

    if (
        user.isInstitutionAdmin
        and collection.institutionId is not None
        and user.institutionId is not None
        and int(collection.institutionId) == int(user.institutionId)
    ):
        return True

    return False


def _resolve_unique_taxon_for_identification(
    db: Session,
    scientific_name: str,
    authorship: Optional[str],
) -> Optional[Taxon]:
    """
    Intenta resolver un Taxon ÚNICO para una identificación, siguiendo esta lógica:

    1. Buscar por scientificName + scientificNameAuthorship (cuando viene autoría),
       o scientificName + (authorship IS NULL/'') cuando no viene autoría.
    2. Si no hay resultados, reintentar ignorando la autoría (solo scientificName).
    3. Si hay exactamente 1 candidato en cualquier paso, se usa ese.
    4. Si hay múltiples, se intenta refinar:
        - Priorizar isCurrent = True (si hay exactamente 1).
        - Luego taxonomicStatus = "Accepted" y nomenclaturalStatus = "Valid" (si hay 1).
        - Luego aquellos con tplID no nulo/vacío (si hay 1).
    5. Si sigue habiendo múltiples o ninguno, devuelve None (no se asigna taxonId).
    """
    if not scientific_name:
        return None

    # 1) scientificName + authorship (o authorship vacío/nulo)
    base_q = select(Taxon).where(Taxon.scientificName == scientific_name)
    if authorship:
        base_q = base_q.where(Taxon.scientificNameAuthorship == authorship)
    else:
        base_q = base_q.where(
            or_(
                Taxon.scientificNameAuthorship.is_(None),
                Taxon.scientificNameAuthorship == "",
            )
        )

    candidates = db.execute(base_q).scalars().all()

    # 2) Fallback: ignorar autoría si no encontramos nada
    if not candidates:
        q2 = select(Taxon).where(Taxon.scientificName == scientific_name)
        candidates = db.execute(q2).scalars().all()

    # Si sigue sin haber nada, no hay taxon
    if not candidates:
        return None

    # Si ya hay un único candidato, listo
    if len(candidates) == 1:
        return candidates[0]

    # A partir de aquí hay múltiples: intentamos refinar
    current = candidates

    # 3) Priorizar isCurrent = True
    current_only = [t for t in current if getattr(t, "isCurrent", False)]
    if len(current_only) == 1:
        return current_only[0]
    if current_only:
        current = current_only

    # 4) Priorizar Accepted + Valid
    accepted_valid = [
        t
        for t in current
        if getattr(t, "taxonomicStatus", None) == "Accepted"
        and getattr(t, "nomenclaturalStatus", None) == "Valid"
    ]
    if len(accepted_valid) == 1:
        return accepted_valid[0]
    if accepted_valid:
        current = accepted_valid

    # 5) Priorizar los que tienen tplID
    with_tplid = [t for t in current if getattr(t, "tplID", None)]
    if len(with_tplid) == 1:
        return with_tplid[0]

    # Sigue habiendo ambigüedad → no asignamos taxonId
    return None


# =========================
# Endpoint: Upload DWC CSV
# =========================
@router.post(
    "/dwc-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Sube un CSV DwC estricto y lo inserta a una colección",
)
def upload_dwc_csv(
    collection_id: int = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(
        ..., description="Archivo CSV (DwC headers: dwc:Entity:field)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    - Valida extensión y contenido CSV.
    - Valida headers estrictos 'dwc:Entity:field'.
    - Inserta Occurrence aplanado (Occurrence + Event + Location).
    - Crea SIEMPRE una Identification por fila con:
        * scientificName y scientificNameAuthorship copiados del bloque Taxon (si vienen).
        * Un taxonId asignado SOLO si se puede resolver un Taxon único
          según la lógica de resolución (backbone ya cargado).
    - Crea/recupera Identifier(s) según identifiedBy / identifiedByID (separados por comas) y
      crea IdentificationIdentifier con el order, **solo si vienen nombres/IDs**.
    - Crea/recupera Agent(s) según recordedBy / recordedByID (separados por comas) y
      crea OccurrenceAgent con orden, **solo si vienen colectores**.
    - Marca la Identification creada como isCurrent = True y la asigna como
      currentIdentification de la Occurrence.
    - A NIVEL DE CABECERA (no por fila) se exigen las columnas:
        * dwc:Occurrence:recordNumber
        * dwc:Occurrence:catalogNumber
        * dwc:Occurrence:recordedBy
        * dwc:Taxon:scientificName
        * dwc:Taxon:scientificNameAuthorship
        * dwc:Identification:identifiedBy
      A NIVEL DE FILA:
        - Ningún valor es obligatorio. Si viene vacío, se deja el atributo como None.
    """
    # -------- Validaciones básicas de archivo --------
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    # -------- Colección + permisos --------
    collection = db.scalar(select(Collection).where(Collection.id == collection_id))
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )

    if not _user_can_edit_collection(db, current_user, collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para cargar en esta colección",
        )

    # -------- Leer CSV a memoria --------
    try:
        raw = file.file.read()
    finally:
        file.file.close()
    try:
        # Soporta BOM utf-8
        text = raw.decode("utf-8-sig")
    except Exception:
        try:
            text = raw.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo decodificar el CSV (utf-8/latin-1)",
            )

    reader = csv.reader(io.StringIO(text))
    headers = next(reader, None)
    if headers is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV vacío (sin headers)",
        )

    # -------- Validar headers estrictos --------
    try:
        colmap = _strict_parse_headers(headers)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    # -------- Validar columnas obligatorias (CABECERAS) --------
    required_headers = [
        ("Occurrence", "recordNumber"),
        ("Occurrence", "catalogNumber"),
        ("Occurrence", "recordedBy"),
        ("Taxon", "scientificName"),
        ("Taxon", "scientificNameAuthorship"),
        ("Identification", "identifiedBy"),  # header obligatorio, valor por fila puede ser vacío
    ]
    missing_cols = [
        f"dwc:{ent}:{field}"
        for (ent, field) in required_headers
        if (ent, field) not in colmap
    ]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faltan columnas obligatorias en el CSV: " + ", ".join(missing_cols),
        )

    # -------- Caches de corrida y stats --------
    taxon_cache: Dict[Tuple[str, str], Optional[Taxon]] = {}
    agent_cache: Dict[Tuple[str, str], Agent] = {}
    identifier_cache: Dict[Tuple[str, str], Identifier] = {}

    stats = {
        "rows": 0,
        "occurrencesInserted": 0,
        "taxaMatched": 0,
        "agentsInserted": 0,
        "identificationsInserted": 0,
        "identifiersInserted": 0,
    }

    BATCH_SIZE = 200
    rows_in_batch = 0
    row_number = 1  # header = línea 1

    # -------- Loop principal --------
    try:
        for row in reader:
            row_number += 1
            stats["rows"] += 1

            # Extract por entidad
            occ_d: Dict[str, Any] = {}
            tax_d: Dict[str, Any] = {}
            ident_d: Dict[str, Any] = {}
            recorded_by_id_raw: Optional[str] = None

            for (entity, field), idx in colmap.items():
                val = _clean_value(row[idx] if idx < len(row) else "")
                if val is None:
                    continue

                if entity == "Occurrence":
                    if field == "recordedByID":
                        # No es campo del modelo; lo usamos solo para Agents
                        recorded_by_id_raw = val
                    elif field == "dynamicProperties":
                        occ_d[field] = _to_json_value(val)
                    else:
                        # Solo setea si el atributo existe en el modelo
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Event":
                    if field in {"year", "month", "day"}:
                        if hasattr(Occurrence, field):
                            occ_d[field] = _to_int(val)
                    elif field == "sampleSizeValue":
                        if hasattr(Occurrence, "sampleSizeValue"):
                            occ_d["sampleSizeValue"] = _to_float(val)
                    else:
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Location":
                    if field in {
                        "decimalLatitude",
                        "decimalLongitude",
                        "minimumElevationInMeters",
                        "maximumElevationInMeters",
                    }:
                        if hasattr(Occurrence, field):
                            occ_d[field] = _to_float(val)
                    else:
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Taxon":
                    tax_d[field] = val

                elif entity == "Identification":
                    if field in {"isCurrent", "isVerified"}:
                        ident_d[field] = _to_bool(val)
                    else:
                        ident_d[field] = val

            # -------- SIN campos obligatorios por fila --------
            # Lo que venga se usa, lo que no venga se deja como None.
            sci_name = tax_d.get("scientificName")
            sci_auth = tax_d.get("scientificNameAuthorship")  # puede ser None/''

            identified_by_text = ident_d.get("identifiedBy")

            # -------- Resolver Taxon (no se crean taxones nuevos) --------
            # Lógica: solo asignar taxonId si se puede resolver un TAXON ÚNICO.
            # Si no hay scientificName, _resolve_unique_taxon_for_identification devolverá None.
            tkey = _taxon_key(sci_name, sci_auth)

            if tkey not in taxon_cache:
                taxon_cache[tkey] = _resolve_unique_taxon_for_identification(
                    db=db,
                    scientific_name=sci_name,
                    authorship=sci_auth,
                )

            taxon_obj = taxon_cache[tkey]

            if taxon_obj is not None:
                stats["taxaMatched"] += 1

            # -------- Crear Occurrence aplanado --------
            occ = Occurrence(**occ_d)
            occ.collectionId = collection_id
            occ.digitizerUserId = current_user.id

            db.add(occ)
            db.flush()  # obtener occ.id
            stats["occurrencesInserted"] += 1

            # -------- Colectores: recordedBy / recordedByID -> Agents + OccurrenceAgent --------
            collectors = _split_list(occ.recordedBy)
            collectors_ids = _split_list(recorded_by_id_raw)

            # Si no hay colectores ni IDs, simplemente no se crea ningún Agent/OccurrenceAgent
            if collectors or collectors_ids:
                max_len_collectors = max(len(collectors), len(collectors_ids))
                for order, idx_c in enumerate(range(max_len_collectors), start=1):
                    name = collectors[idx_c] if idx_c < len(collectors) else None
                    id_value = (
                        collectors_ids[idx_c] if idx_c < len(collectors_ids) else None
                    )

                    if not name and not id_value:
                        continue

                    cache_key = (name or "", id_value or "")
                    agent = agent_cache.get(cache_key)

                    if not agent:
                        # 1) Buscar por nombre completo
                        agent = None
                        if name:
                            agent = (
                                db.execute(
                                    select(Agent).where(Agent.fullName == name)
                                )
                                .scalars()
                                .first()
                            )

                        # 2) Si no se encontró por nombre, buscar por ID (orcID)
                        if not agent and id_value:
                            agent = (
                                db.execute(
                                    select(Agent).where(Agent.orcID == id_value)
                                )
                                .scalars()
                                .first()
                            )

                        # 3) Si no existe, crear nuevo
                        if not agent:
                            agent = Agent(
                                fullName=name or None,
                                orcID=id_value or None,
                            )
                            db.add(agent)
                            db.flush()
                            stats["agentsInserted"] += 1
                        else:
                            # Actualizar datos si vienen nuevos
                            updated = False
                            if name and not agent.fullName:
                                agent.fullName = name
                                updated = True
                            if id_value and not agent.orcID:
                                agent.orcID = id_value
                                updated = True
                            if updated:
                                db.add(agent)

                        agent_cache[cache_key] = agent

                    oa = OccurrenceAgent(
                        occurrenceId=occ.id,
                        agentId=agent.id,
                        agentOrder=order,
                    )
                    db.add(oa)

            # -------- Identificación + Identifiers --------
            is_verified = ident_d.get("isVerified")
            if is_verified is None:
                is_verified = False

            identification_obj = Identification(
                occurrenceId=occ.id,
                taxonId=taxon_obj.id if taxon_obj is not None else None,
                scientificName=sci_name,
                scientificNameAuthorship=sci_auth,
                identifiedBy=identified_by_text,  # puede ser None si venía vacío
                dateIdentified=ident_d.get("dateIdentified"),
                isCurrent=True,  # esta es la identificación vigente al momento de la carga
                isVerified=is_verified,
                typeStatus=ident_d.get("typeStatus"),
            )
            db.add(identification_obj)
            db.flush()  # necesitamos identification_obj.id

            # Marcarla como currentIdentification de la Occurrence
            occ.currentIdentificationId = identification_obj.id
            db.add(occ)

            stats["identificationsInserted"] += 1

            # Identificadores (personas) con orden
            # Si identified_by_text es None/"" => names_list = [] y no se crea nada
            names_list = _split_list(identified_by_text)
            ids_list = _split_list(ident_d.get("identifiedByID"))

            if names_list or ids_list:
                max_len_ident = max(len(names_list), len(ids_list))
                for idx_i in range(max_len_ident):
                    name = names_list[idx_i] if idx_i < len(names_list) else None
                    id_value = ids_list[idx_i] if idx_i < len(ids_list) else None

                    if not name and not id_value:
                        continue

                    cache_key = (name or "", id_value or "")
                    identifier_obj = identifier_cache.get(cache_key)

                    if not identifier_obj:
                        # 1) Buscar por nombre completo
                        identifier_obj = None
                        if name:
                            identifier_obj = (
                                db.execute(
                                    select(Identifier).where(
                                        Identifier.fullName == name
                                    )
                                )
                                .scalars()
                                .first()
                            )

                        # 2) Si no se encontró por nombre, buscar por ID (orcID)
                        if not identifier_obj and id_value:
                            identifier_obj = (
                                db.execute(
                                    select(Identifier).where(
                                        Identifier.orcID == id_value
                                    )
                                )
                                .scalars()
                                .first()
                            )

                        # 3) Si no existe, crear nuevo
                        if not identifier_obj:
                            identifier_obj = Identifier(
                                fullName=name or None,
                                orcID=id_value or None,
                            )
                            db.add(identifier_obj)
                            db.flush()
                            stats["identifiersInserted"] += 1
                        else:
                            # Actualizar si llegan datos nuevos
                            updated = False
                            if name and not identifier_obj.fullName:
                                identifier_obj.fullName = name
                                updated = True
                            if id_value and not identifier_obj.orcID:
                                identifier_obj.orcID = id_value
                                updated = True
                            if updated:
                                db.add(identifier_obj)

                        identifier_cache[cache_key] = identifier_obj

                    link = IdentificationIdentifier(
                        identificationId=identification_obj.id,
                        identifierId=identifier_obj.id,
                        identifierOrder=idx_i + 1,
                    )
                    db.add(link)

            # ---- Commit por lotes ----
            rows_in_batch += 1
            if rows_in_batch >= BATCH_SIZE:
                db.commit()
                rows_in_batch = 0

        # Commit final
        if rows_in_batch > 0:
            db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error procesando CSV (fila {row_number}): {e}",
        ) from e

    return {
        "status": "ok",
        "collectionId": collection_id,
        **stats,
    }


# =========================
# Endpoint: Upload CSV de flora (backbone Taxon, separado por tabs)
# =========================

def _process_taxon_flora_csv_background(content: bytes, filename: str) -> None:
    """
    Procesa el CSV de flora en segundo plano (sin bloquear el request).
    Usa una sesión propia de BD.
    """
    db = SessionLocal()
    try:
        # --- Lectura del CSV en streaming desde los bytes ---
        bin_file = io.BytesIO(content)

        # Nos aseguramos de estar al inicio
        bin_file.seek(0)

        # Sample pequeño para decidir encoding principal
        sample = bin_file.read(65536)  # 64 KB
        encoding = "utf-8-sig"
        try:
            sample.decode("utf-8-sig")
        except UnicodeDecodeError:
            encoding = "latin-1"

        # Volvemos al inicio para procesar todo el archivo
        bin_file.seek(0)

        # Generador que lee línea a línea en binario,
        # repara el patrón \xc2" y decodifica con fallback.
        def decoded_lines(f, enc):
            while True:
                bline = f.readline()
                if not bline:
                    break

                # Parche específico: eliminar byte 0xC2 suelto antes de comillas
                if b'\xc2"' in bline:
                    logger.warning(
                        "Parche UTF-8 aplicado en línea con patrón \\xc2\\\": %r",
                        bline[:200],
                    )
                    bline = bline.replace(b'\xc2"', b'"')

                try:
                    # Intento principal (utf-8-sig o latin-1)
                    yield bline.decode(enc)
                except UnicodeDecodeError:
                    # Fallback robusto: latin-1 con reemplazo
                    yield bline.decode("latin-1", errors="replace")

        # Siempre asumimos separador TAB
        reader = csv.reader(decoded_lines(bin_file, encoding), delimiter="\t")
        headers = next(reader, None)
        if not headers:
            logger.error("CSV vacío (sin headers) en backbone flora")
            return

        # Normalizamos headers (strip)
        headers = [h.strip() for h in headers]
        header_index = {name: idx for idx, name in enumerate(headers)}

        # Debe existir taxonID para usarlo como clave (atributo del modelo)
        if "taxonID" not in header_index:
            logger.error("El CSV de flora no tiene columna 'taxonID'")
            return

        # Deben existir las columnas para filtrar
        required_filter_cols = ["taxonomicStatus", "nomenclaturalStatus", "namePublishedIn"]
        missing_filter_cols = [c for c in required_filter_cols if c not in header_index]
        if missing_filter_cols:
            logger.error(
                "El CSV de flora no tiene columnas requeridas para filtrar: %s",
                ", ".join(missing_filter_cols),
            )
            return

        # --- Determinar campos del modelo Taxon (usamos ATTRS, no nombres físicos de columna) ---
        taxon_mapper = inspect(Taxon)
        # keys = nombres de atributo Python: taxonID, scientificName, taxonomicStatus, etc.
        model_attrs: set[str] = set(taxon_mapper.columns.keys())

        blocked_fields = {"id", "isCurrent"}  # Nunca se tocan desde CSV
        updatable_fields = model_attrs - blocked_fields

        # Columnas del CSV que sí mapean a atributos del modelo
        mapped_fields = [name for name in headers if name in updatable_fields]

        if not mapped_fields:
            logger.error(
                "Ninguna columna del CSV coincide con atributos del modelo Taxon (aparte de 'id' e 'isCurrent')."
            )
            return

        # --- Stats y lógica principal ---
        stats: Dict[str, Any] = {
            "rows": 0,
            "rowsFilteredOut": 0,
            "taxaMarkedNotCurrent": 0,
            "taxaInserted": 0,
            "taxaUpdated": 0,
            "taxaSetCurrent": 0,
        }

        BATCH_SIZE = 2000
        rows_in_batch = 0
        row_number = 1  # header = línea 1

        try:
            # 1) Todos los taxones existentes pasan a isCurrent = False
            result = db.execute(update(Taxon).values(isCurrent=False))
            stats["taxaMarkedNotCurrent"] = result.rowcount or 0

            # 2) Procesar filas del CSV
            for row in reader:
                row_number += 1
                stats["rows"] += 1

                # Aseguramos que la fila tenga al menos tantas columnas como headers
                if len(row) < len(headers):
                    row = row + [""] * (len(headers) - len(row))

                # --- Filtro previo: solo Accepted / Valid / con namePublishedIn ---
                taxonomic_status_raw = row[header_index["taxonomicStatus"]]
                nomenclatural_status_raw = row[header_index["nomenclaturalStatus"]]
                name_published_in_raw = row[header_index["namePublishedIn"]]

                taxonomic_status = (taxonomic_status_raw or "").strip()
                nomenclatural_status = (nomenclatural_status_raw or "").strip()
                name_published_in = (name_published_in_raw or "").strip()

                # Si quieres reactivar el filtro estricto, descomenta:
                # if (
                #     taxonomic_status != "Accepted"
                #     or nomenclatural_status != "Valid"
                #     or not name_published_in
                # ):
                #     stats["rowsFilteredOut"] += 1
                #     continue

                taxon_id_raw = row[header_index["taxonID"]]
                taxon_id_value = (taxon_id_raw or "").strip()

                if not taxon_id_value:
                    logger.warning(
                        "Fila %s: 'taxonID' vacío; se omite fila en backbone flora",
                        row_number,
                    )
                    continue

                # Construir dict con los valores de las columnas mapeadas (atributos del modelo)
                field_values: Dict[str, Any] = {}
                for field in mapped_fields:
                    idx = header_index[field]
                    raw_val = row[idx] if idx < len(row) else ""
                    v = (raw_val or "").strip()
                    field_values[field] = v if v != "" else None

                # Forzamos taxonID en el dict (aunque ya esté mapeado)
                field_values["taxonID"] = taxon_id_value

                # Buscar directamente en BD (taxonID es único a nivel de modelo)
                taxon_obj = (
                    db.execute(select(Taxon).where(Taxon.taxonID == taxon_id_value))
                    .scalars()
                    .first()
                )

                if taxon_obj is None:
                    # Crear nuevo Taxon
                    taxon_obj = Taxon(**field_values)
                    taxon_obj.isCurrent = True
                    db.add(taxon_obj)
                    stats["taxaInserted"] += 1
                    stats["taxaSetCurrent"] += 1
                else:
                    # Actualizar campos si cambiaron
                    changed = False
                    for field, value in field_values.items():
                        if field in blocked_fields:
                            continue
                        if getattr(taxon_obj, field) != value:
                            setattr(taxon_obj, field, value)
                            changed = True

                    if not taxon_obj.isCurrent:
                        taxon_obj.isCurrent = True
                        changed = True
                        stats["taxaSetCurrent"] += 1

                    if changed:
                        db.add(taxon_obj)
                        stats["taxaUpdated"] += 1

                rows_in_batch += 1
                if rows_in_batch >= BATCH_SIZE:
                    db.commit()
                    db.expunge_all()  # evitar que crezca el identity map
                    rows_in_batch = 0

            if rows_in_batch > 0:
                db.commit()
                db.expunge_all()

            logger.info(
                "Backbone flora procesado en background: %s",
                stats,
            )

        except Exception as e:
            db.rollback()
            logger.exception(
                "Error procesando CSV de flora en background (fila %s): %s",
                row_number,
                e,
            )
        finally:
            # Solo log, porque no devolvemos HTTP aquí
            pass

    finally:
        db.close()


@router.post(
    "/taxon-flora-csv",
    status_code=status.HTTP_202_ACCEPTED,
    summary="(Async) Carga/actualiza el backbone Taxon (flora) desde un CSV tabulado",
)
async def upload_taxon_flora_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(
        ...,
        description=(
            "CSV de flora (extensión .csv) separado por tabulaciones, con cabeceras que "
            "coinciden con atributos del modelo Taxon (incluyendo 'taxonID')."
        ),
    ),
    current_user: User = Depends(require_superuser),
):
    """
    Versión asíncrona:
    - Valida extensión y lee el archivo en memoria.
    - Agenda un BackgroundTask que:
        * Marca todos los Taxon como isCurrent = False.
        * Recorre el CSV tabulado.
        * Inserta/actualiza Taxon usando taxonID como clave.
    - Retorna inmediatamente con 202 Accepted.
    """

    filename = (file.filename or "").lower()
    logger.info("Subiendo backbone flora CSV (async): %s", filename)

    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    # Leemos el contenido completo una sola vez (UploadFile ya no será válido luego)
    try:
        content = await file.read()
    finally:
        await file.close()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo vacío.",
        )

    # Agendar procesamiento en background
    background_tasks.add_task(
        _process_taxon_flora_csv_background,
        content,
        filename,
    )

    # Respuesta inmediata (no tenemos stats aún)
    return {
        "status": "accepted",
        "backbone": "taxon",
        "filename": filename,
        "detail": "El archivo se está procesando en segundo plano.",
    }


@router.post(
    "/image",
    status_code=status.HTTP_201_CREATED,
    summary="Subir una imagen y asociarla a una Occurrence a través de SeaweedFS",
)
def upload_image_seaweedfs(
    occurrence_id: int = Form(..., description="ID de la Ocurrencia destino"),
    file: UploadFile = File(..., description="Archivo de imagen"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sube una imagen al cluster de SeaweedFS y crea un OccurrenceImage.
    """

    occurrence = db.scalar(select(Occurrence).where(Occurrence.id == occurrence_id))
    if not occurrence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found"
        )
        
    if not _user_can_edit_collection(db, current_user, occurrence.collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para editar esta colección",
        )

    # 1. Subir imagen a SeaweedFS Filer (en herbarium_seaweedfs:8888)
    try:
        institution_name = "UnknownInstitution"
        collection_code = "UnknownCollection"
        catalog_number = occurrence.catalogNumber or "UnknownCatalog"

        if occurrence.collection:
            collection_code = occurrence.collection.collectionCode or "UnknownCollection"
            if occurrence.collection.institution:
                institution_name = occurrence.collection.institution.institutionName or "UnknownInstitution"

        # Sanitizar rutas para URL
        institution_name_safe = institution_name.replace(" ", "_").replace("/", "-")
        collection_code_safe = collection_code.replace(" ", "_").replace("/", "-")
        catalog_number_safe = catalog_number.replace(" ", "_").replace("/", "-")
        
        safe_filename = file.filename.replace(" ", "_")
        unique_filename = f"{uuid.uuid4()}_{safe_filename}"
        
        image_path = f"/images/{institution_name_safe}/{collection_code_safe}/{catalog_number_safe}/{unique_filename}"
        upload_url = f"{seaweedfs_internal_url}{image_path}"
        
        files = {"file": (file.filename, file.file, file.content_type)}
        upload_res = requests.post(upload_url, files=files)
        upload_res.raise_for_status()
        
        # Filer devuelve información json sobre la carga
        upload_data = upload_res.json()
        file_size = upload_data.get("size", 0)
    except Exception as e:
        logger.error(f"Error subiendo imagen a SeaweedFS Filer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error copiando el archivo al servidor de archivos (Filer)",
        )

    # 2. Guardar en Base de Datos
    occ_img = OccurrenceImage(
        occurrenceId=occurrence.id,
        imagePath=image_path,
        fileSize=file_size,
        photographer=current_user.fullName or current_user.username
    )
    
    db.add(occ_img)
    db.commit()
    db.refresh(occ_img)

    return {
        "status": "ok",
        "occurrenceImageId": occ_img.id,
        "occurrenceId": occurrence.id,
        "imagePath": image_path,
        "size": file_size,
        "publicUrl": f"{seaweedfs_public_url}{image_path}"
    }


@router.get(
    "/image/{image_id}",
    summary="Descargar u obtener una imagen por su ID",
)
def get_image_seaweedfs(
    image_id: int,
    db: Session = Depends(get_db),
):
    """
    Obtiene una imagen de SeaweedFS consultando su ruta original mediante el OccurrenceImage ID
    """
    image = db.scalar(select(OccurrenceImage).where(OccurrenceImage.id == image_id))
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )
    
    # URL interna definida para SeaweedFS en docker network
    download_url = f"http://herbarium_seaweedfs:8888{image.imagePath}"
    
    try:
        response = requests.get(download_url, stream=True)
        response.raise_for_status()
        
        return StreamingResponse(
            response.iter_content(chunk_size=1024*1024),
            media_type=response.headers.get("Content-Type", "image/jpeg"),
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading image from SeaweedFS: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading image from SeaweedFS"
        )
