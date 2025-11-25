# backend/routers/upload.py
from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, exists, or_, update
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect
from datetime import datetime

from backend.config.database import get_db
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
    - Resuelve Taxon usando scientificName + scientificNameAuthorship (backbone ya cargado).
      * Si hay múltiples, toma el primero por id.
    - Crea una Identification por fila (obligatorio si hay taxon).
    - Crea/recupera Identifier(s) según identifiedBy / identifiedByID (separados por comas) y
      crea IdentificationIdentifier con el order.
    - Crea/recupera Agent(s) según recordedBy / recordedByID (separados por comas) y
      crea OccurrenceAgent con orden.
    - Campos obligatorios (a nivel CSV):
        * dwc:Occurrence:recordNumber
        * dwc:Occurrence:catalogNumber
        * dwc:Occurrence:recordedBy
        * dwc:Taxon:scientificName
        * dwc:Taxon:scientificNameAuthorship
        * dwc:Identification:identifiedBy
      recordedByID e identifiedByID son opcionales.
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

    # -------- Validar columnas obligatorias --------
    required_headers = [
        ("Occurrence", "recordNumber"),
        ("Occurrence", "catalogNumber"),
        ("Occurrence", "recordedBy"),
        ("Taxon", "scientificName"),
        ("Taxon", "scientificNameAuthorship"),
        ("Identification", "identifiedBy"),
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

            # -------- Validaciones de VALORES obligatorios por fila --------
            for fld in ("recordNumber", "catalogNumber", "recordedBy"):
                if not occ_d.get(fld):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Fila {row_number}: el campo Occurrence.{fld} "
                            f"es obligatorio y está vacío."
                        ),
                    )

            sci_name = tax_d.get("scientificName")
            if not sci_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Fila {row_number}: el campo Taxon.scientificName "
                        "es obligatorio y está vacío."
                    ),
                )
            sci_auth = tax_d.get("scientificNameAuthorship")  # puede ser None/''

            identified_by_text = ident_d.get("identifiedBy")
            if not identified_by_text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Fila {row_number}: el campo Identification.identifiedBy "
                        "es obligatorio y está vacío."
                    ),
                )

            # -------- Resolver Taxon (no se crean taxones nuevos) --------
            tkey = _taxon_key(sci_name, sci_auth)
            taxon_obj = taxon_cache.get(tkey)

            if tkey not in taxon_cache:
                # Buscar por scientificName + authorship (si authorship es None/"" aceptar nulos/vacíos)
                q = select(Taxon).where(Taxon.scientificName == sci_name)
                if sci_auth:
                    q = q.where(Taxon.scientificNameAuthorship == sci_auth)
                else:
                    q = q.where(
                        or_(
                            Taxon.scientificNameAuthorship.is_(None),
                            Taxon.scientificNameAuthorship == "",
                        )
                    )
                q = q.order_by(Taxon.id.asc())
                taxon_obj = db.execute(q).scalars().first()
                taxon_cache[tkey] = taxon_obj

            if not taxon_obj:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Fila {row_number}: no se encontró Taxon para "
                        f"scientificName='{sci_name}', "
                        f"scientificNameAuthorship='{sci_auth or ''}'."
                    ),
                )

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

            if not collectors:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Fila {row_number}: recordedBy es obligatorio y no se pudo interpretar."
                    ),
                )

            max_len_collectors = max(len(collectors), len(collectors_ids))
            for order, idx_c in enumerate(range(max_len_collectors), start=1):
                name = collectors[idx_c] if idx_c < len(collectors) else None
                id_value = collectors_ids[idx_c] if idx_c < len(collectors_ids) else None

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

                    # 2) Si no se encontró por nombre, buscar por ID (agentID)
                    if not agent and id_value:
                        agent = (
                            db.execute(
                                select(Agent).where(Agent.agentID == id_value)
                            )
                            .scalars()
                            .first()
                        )

                    # 3) Si no existe, crear nuevo
                    if not agent:
                        agent = Agent(
                            fullName=name or None,
                            agentID=id_value or None,
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
                        if id_value and not agent.agentID:
                            agent.agentID = id_value
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
            is_current = ident_d.get("isCurrent")
            if is_current is None:
                is_current = True
            is_verified = ident_d.get("isVerified")
            if is_verified is None:
                is_verified = False

            identification_obj = Identification(
                occurrenceId=occ.id,
                taxonId=taxon_obj.id,
                identifiedBy=identified_by_text,
                dateIdentified=ident_d.get("dateIdentified"),
                isCurrent=is_current,
                isVerified=is_verified,
                typeStatus=ident_d.get("typeStatus"),
            )
            db.add(identification_obj)
            db.flush()
            stats["identificationsInserted"] += 1

            # Identificadores (personas) con orden
            names_list = _split_list(identified_by_text)
            ids_list = _split_list(ident_d.get("identifiedByID"))

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
                                select(Identifier).where(Identifier.fullName == name)
                            )
                            .scalars()
                            .first()
                        )

                    # 2) Si no se encontró por nombre, buscar por ID
                    if not identifier_obj and id_value:
                        identifier_obj = (
                            db.execute(
                                select(Identifier).where(
                                    Identifier.identifierID == id_value
                                )
                            )
                            .scalars()
                            .first()
                        )

                    # 3) Si no existe, crear nuevo
                    if not identifier_obj:
                        identifier_obj = Identifier(
                            fullName=name or None,
                            identifierID=id_value or None,
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
                        if id_value and not identifier_obj.identifierID:
                            identifier_obj.identifierID = id_value
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

@router.post(
    "/taxon-flora-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Carga/actualiza el backbone Taxon (flora) desde un CSV tabulado",
)
def upload_taxon_flora_csv(
    file: UploadFile = File(
        ...,
        description=(
            "CSV de flora (extensión .csv) separado por tabulaciones, con cabeceras que "
            "coinciden con columnas del modelo Taxon (incluyendo 'taxonID')."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """
    Reemplaza la versión actual del backbone taxonómico (flora):

    1. Marca TODOS los Taxon existentes con isCurrent = False.
    2. Recorre el CSV (separado por tabs), pero SOLO considera filas donde:
         - taxonomicStatus == "Accepted"
         - nomenclaturalStatus == "Valid"
         - namePublishedIn no está vacío.
       Las demás filas se descartan y NO se insertan/actualizan.
    3. Para cada fila válida, toma taxonID como clave (único):
        - Si existe un Taxon con ese taxonID:
            * Actualiza los campos presentes en el CSV (excepto 'id' e 'isCurrent').
            * Marca isCurrent = True.
        - Si no existe:
            * Crea un nuevo Taxon con esos campos.
            * isCurrent = True.
    """

    # --- Validar extensión (solo .csv) ---
    filename = (file.filename or "").lower()
    logger.info("Subiendo backbone flora CSV: %s", filename)
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    # --- Lectura del CSV en streaming, sin cargar todo a memoria ---
    bin_file = file.file  # SpooledTemporaryFile

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
            # Caso que viste: '... 1927, n.\xc2"\t2022-04-16 ...'
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV vacío (sin headers).",
        )

    # Normalizamos headers (strip)
    headers = [h.strip() for h in headers]
    header_index = {name: idx for idx, name in enumerate(headers)}

    # Debe existir taxonID para usarlo como clave
    if "taxonID" not in header_index:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El CSV debe incluir una columna 'taxonID' (identificador del taxón en la flora).",
        )

    # Deben existir las columnas para filtrar
    required_filter_cols = ["taxonomicStatus", "nomenclaturalStatus", "namePublishedIn"]
    missing_filter_cols = [c for c in required_filter_cols if c not in header_index]
    if missing_filter_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El CSV debe incluir las columnas "
                "'taxonomicStatus', 'nomenclaturalStatus' y 'namePublishedIn' "
                "para poder filtrar taxones aceptados/válidos/publicados."
            ),
        )

    # --- Determinar columnas del modelo Taxon (para mapear solo las válidas) ---
    taxon_table = inspect(Taxon)
    model_columns: set[str] = {c.name for c in taxon_table.columns}
    blocked_fields = {"id", "isCurrent"}  # Nunca se tocan desde CSV
    updatable_fields = model_columns - blocked_fields

    # Columnas del CSV que sí mapean a campos del modelo
    mapped_fields = [name for name in headers if name in updatable_fields]

    if not mapped_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Ninguna columna del CSV coincide con campos del modelo Taxon "
                "(aparte de 'id' e 'isCurrent')."
            ),
        )

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
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Fila {row_number}: el campo 'taxonID' es obligatorio y viene vacío.",
                )

            # Construir dict con los valores de las columnas mapeadas
            field_values: Dict[str, Any] = {}
            for field in mapped_fields:
                idx = header_index[field]
                raw_val = row[idx] if idx < len(row) else ""
                v = (raw_val or "").strip()
                field_values[field] = v if v != "" else None

            # Forzamos taxonID en el dict (aunque ya esté mapeado)
            field_values["taxonID"] = taxon_id_value

            # Buscar directamente en BD (taxonID es único)
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

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception(
            "Error procesando CSV de flora (fila %s)", row_number
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error procesando CSV de flora (fila {row_number}): {e}",
        ) from e

    return {
        "status": "ok",
        "backbone": "taxon",
        "delimiter": "\\t",
        "encoding": encoding,
        **stats,
    }
