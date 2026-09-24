# backend/scripts/seed_admin_divisions.py
"""Siembra el catálogo de países y divisiones administrativas.

Fuentes:
- Perú: catálogo INEI (ubigeo) en backend/data/ubigeo/ (3 niveles).
- Todos los países (~250, ISO 3166-1 de GeoNames countryInfo.txt):
  GeoNames admin1CodesASCII.txt + admin2Codes.txt (CC-BY 4.0),
  descargados a backend/data/geonames/ si no existen. Los nombres en
  español provienen de country_names_es.json (generado con
  Intl.DisplayNames); si un código no está, se usa el nombre en inglés
  de countryInfo.txt.

La tabla `country` se deriva de esta unión: solo existen países que alguna
fuente cubre. Idempotente: re-ejecutar actualiza nombres/parentescos.

Uso:
    python -m backend.scripts.seed_admin_divisions
    python -m backend.scripts.seed_admin_divisions --adm3 BR,MX
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
import ssl
import subprocess
import tempfile
import unicodedata
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.config.database import (
    Base,
    SessionLocal,
    engine,
    ensure_database_extensions,
)
from backend.models.models import AdminDivision, Country

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
UBIGEO_DIR = DATA_DIR / "ubigeo"
GEONAMES_DIR = DATA_DIR / "geonames"
INEI_DIR = DATA_DIR / "inei"

GEONAMES_BASE_URL = "https://download.geonames.org/export/dump"

# Polígonos oficiales de INEI (IDE INEI): RAR con GeoPackage de límites
# distritales. Los niveles 1 y 2 se derivan como unión de sus distritos.
INEI_DISTRITO_URL = "https://ide.inei.gob.pe/files/Distrito.rar"

# Único país con catálogo INEI (3 niveles: departamento/provincia/distrito);
# los demás toman sus divisiones de GeoNames (2 niveles por defecto,
# nivel 3 opcional con --adm3).
INEI_COUNTRY = "PE"


def normalize_name(name: str) -> str:
    """Minúsculas, sin tildes y con espacios colapsados (para matching)."""
    decomposed = unicodedata.normalize("NFKD", name)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip().lower()


# --------------------------------------------------------------------------
# Upserts genéricos
# --------------------------------------------------------------------------


def load_countries(adm3_countries: Iterable[str]) -> List[Tuple[str, str, str, int]]:
    """(code, name, source, admin_levels) para todos los países de countryInfo.txt."""
    adm3 = {c.upper() for c in adm3_countries}
    es_names = {}
    es_path = GEONAMES_DIR / "country_names_es.json"
    if es_path.exists():
        es_names = json.loads(es_path.read_text())

    out: List[Tuple[str, str, str, int]] = []
    countryinfo = _ensure_geonames_file("countryInfo.txt")
    for line in countryinfo.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        cols = line.split("\t")
        code = cols[0]
        if not re.fullmatch(r"[A-Z]{2}", code):
            continue
        name = es_names.get(code) or cols[4]
        if code == INEI_COUNTRY:
            out.append((code, name, "INEI", 3))
        else:
            out.append((code, name, "GEONAMES", 3 if code in adm3 else 2))
    return out


def upsert_countries(db: Session, adm3_countries: Iterable[str]) -> None:
    for code, name, source, admin_levels in load_countries(adm3_countries):
        row = db.get(Country, code)
        if row is None:
            row = Country(code=code)
            db.add(row)
        row.name = name
        row.source = source
        row.adminLevels = admin_levels
    db.flush()


def upsert_divisions(
    db: Session,
    country_code: str,
    level: int,
    rows: Dict[str, Tuple[str, Optional[str]]],  # code -> (name, source_id)
    source: str,
) -> None:
    """Upsert de un nivel; los parent_id se rellenan después de todos los niveles."""
    existing = {
        d.code: d
        for d in db.scalars(
            select(AdminDivision).where(
                AdminDivision.countryCode == country_code,
                AdminDivision.level == level,
            )
        )
    }
    for code, (name, source_id) in rows.items():
        row = existing.get(code)
        if row is None:
            row = AdminDivision(countryCode=country_code, level=level, code=code, source=source)
            db.add(row)
            existing[code] = row
        row.name = name
        row.normalizedName = normalize_name(name)
        row.source = source
        row.sourceId = source_id
    db.flush()


def link_parents(
    db: Session,
    country_code: str,
    level: int,
    parent_of: Dict[str, str],  # code hijo -> code padre (nivel `level - 1`)
) -> None:
    parent_ids = {
        d.code: d.id
        for d in db.scalars(
            select(AdminDivision).where(
                AdminDivision.countryCode == country_code,
                AdminDivision.level == level - 1,
            )
        )
    }
    children = db.scalars(
        select(AdminDivision).where(
            AdminDivision.countryCode == country_code,
            AdminDivision.level == level,
        )
    )
    for child in children:
        parent_code = parent_of.get(child.code)
        if parent_code and parent_code in parent_ids:
            child.parentId = parent_ids[parent_code]
    db.flush()


# --------------------------------------------------------------------------
# Perú (INEI ubigeo)
# --------------------------------------------------------------------------


def seed_peru(db: Session) -> None:
    departamentos = json.loads((UBIGEO_DIR / "ubigeo_peru_2016_departamentos.json").read_text())
    provincias = json.loads((UBIGEO_DIR / "ubigeo_peru_2016_provincias.json").read_text())
    distritos = json.loads((UBIGEO_DIR / "ubigeo_peru_2016_distritos.json").read_text())

    upsert_divisions(
        db,
        "PE",
        1,
        {d["id"]: (d["name"], d["id"]) for d in departamentos},
        source="INEI",
    )
    upsert_divisions(
        db,
        "PE",
        2,
        {p["id"]: (p["name"], p["id"]) for p in provincias},
        source="INEI",
    )
    upsert_divisions(
        db,
        "PE",
        3,
        {d["id"]: (d["name"], d["id"]) for d in distritos},
        source="INEI",
    )
    link_parents(db, "PE", 2, {p["id"]: p["department_id"] for p in provincias})
    link_parents(db, "PE", 3, {d["id"]: d["province_id"] for d in distritos})


# --------------------------------------------------------------------------
# GeoNames
# --------------------------------------------------------------------------


def _ensure_geonames_file(filename: str) -> Path:
    GEONAMES_DIR.mkdir(parents=True, exist_ok=True)
    path = GEONAMES_DIR / filename
    if path.exists():
        return path
    url = f"{GEONAMES_BASE_URL}/{filename}"
    print(f"[seed] Descargando {url} ...")
    with urllib.request.urlopen(url, timeout=120) as resp:
        path.write_bytes(resp.read())
    return path


def _parse_geonames_codes(path: Path, prefix_filter: Optional[str]) -> Dict[str, Tuple[str, str]]:
    """Filas `code<TAB>name<TAB>asciiName<TAB>geonameid` → code -> (name, geonameid)."""
    out: Dict[str, Tuple[str, str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        code, name = parts[0], parts[1]
        if prefix_filter and not code.startswith(prefix_filter):
            continue
        out[code] = (name, parts[3])
    return out


def seed_geonames(db: Session, adm3_countries: List[str]) -> None:
    admin1_path = _ensure_geonames_file("admin1CodesASCII.txt")
    admin2_path = _ensure_geonames_file("admin2Codes.txt")

    admin1 = _parse_geonames_codes(admin1_path, None)
    admin2 = _parse_geonames_codes(admin2_path, None)

    # Agrupar por país para hacer un solo upsert (y un solo SELECT) por país/nivel.
    # El país INEI se excluye: sus divisiones provienen del catálogo oficial.
    admin1_by_cc: Dict[str, Dict[str, Tuple[str, str]]] = {}
    for code, (name, geonameid) in admin1.items():
        cc = code.split(".", 1)[0]
        if cc != INEI_COUNTRY:
            admin1_by_cc.setdefault(cc, {})[code] = (name, geonameid)
    admin2_by_cc: Dict[str, Dict[str, Tuple[str, str]]] = {}
    for code, (name, geonameid) in admin2.items():
        cc = code.split(".", 1)[0]
        if cc != INEI_COUNTRY:
            admin2_by_cc.setdefault(cc, {})[code] = (name, geonameid)

    for cc, rows in admin1_by_cc.items():
        upsert_divisions(db, cc, 1, rows, source="GEONAMES")
    for cc, rows in admin2_by_cc.items():
        upsert_divisions(db, cc, 2, rows, source="GEONAMES")

    # Los ADM1 son raíz; los ADM2 cuelgan de su ADM1 por prefijo "CC.XX.YY"
    for cc in admin2_by_cc:
        rows2 = _level_rows(db, cc, 2)
        link_parents(db, cc, 2, {code: code.rsplit(".", 1)[0] for code in rows2})

    for cc in adm3_countries:
        seed_geonames_adm3(db, cc)


def _level_rows(db: Session, country_code: str, level: int) -> Dict[str, Tuple[str, str]]:
    rows = db.scalars(
        select(AdminDivision).where(
            AdminDivision.countryCode == country_code,
            AdminDivision.level == level,
        )
    )
    return {r.code: (r.name, r.sourceId or "") for r in rows}


def seed_geonames_adm3(db: Session, country_code: str) -> None:
    """Nivel 3 (p.ej. municipios) desde el dump por país {CC}.zip."""
    zip_path = _ensure_geonames_file(f"{country_code}.zip")
    adm3: Dict[str, Tuple[str, str]] = {}
    with zipfile.ZipFile(zip_path) as zf:
        txt_name = zf.namelist()[0]
        with zf.open(txt_name) as fh:
            for raw in io_iter_lines(fh):
                parts = raw.split("\t")
                # 0 geonameid, 1 name, 7 feature code, 10 admin1, 11 admin2, 12 admin3
                if len(parts) < 13 or parts[7] != "ADM3":
                    continue
                a1, a2, a3 = parts[10], parts[11], parts[12]
                if not (a1 and a2 and a3):
                    continue
                code = f"{country_code}.{a1}.{a2}.{a3}"
                adm3[code] = (parts[1], parts[0])

    upsert_divisions(db, country_code, 3, adm3, source="GEONAMES")
    parent_of = {code: code.rsplit(".", 1)[0] for code in adm3}
    link_parents(db, country_code, 3, parent_of)


def io_iter_lines(fh) -> Iterable[str]:
    for raw in fh:
        yield raw.decode("utf-8").rstrip("\n")


# --------------------------------------------------------------------------
# Perú: polígonos oficiales INEI (PostGIS)
# --------------------------------------------------------------------------


def _gpkg_wkb(blob: bytes) -> bytes:
    """Extrae el WKB estándar de un binario GeoPackage (cabecera 'GP')."""
    flags = blob[3]
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    header = 8 + envelope_sizes[(flags >> 1) & 0x07]
    return blob[header:]


def _download_inei_rar(dest: Path) -> None:
    print(f"[seed] Descargando {INEI_DISTRITO_URL} ...")
    try:
        with urllib.request.urlopen(INEI_DISTRITO_URL, timeout=300) as resp:
            dest.write_bytes(resp.read())
    except ssl.SSLError:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(INEI_DISTRITO_URL, timeout=300, context=ctx) as resp:
            dest.write_bytes(resp.read())


def _ensure_inei_gpkg() -> Path:
    """Devuelve el GeoPackage de distritos, descargándolo si no existe."""
    INEI_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(INEI_DIR.glob("*.gpkg"))
    if existing:
        return existing[0]

    rar_path = INEI_DIR / "Distrito.rar"
    if not rar_path.exists():
        _download_inei_rar(rar_path)

    extractor = next((b for b in ("unrar", "unar", "7z", "7za", "bsdtar") if shutil.which(b)), None)
    if extractor is None:
        raise RuntimeError(
            "No hay extractor RAR disponible (instala unrar/7z) o coloca el "
            f"GeoPackage manualmente en {INEI_DIR}/ (descarga: {INEI_DISTRITO_URL})"
        )
    with tempfile.TemporaryDirectory() as tmp:
        if extractor in ("7z", "7za"):
            subprocess.run(
                [extractor, "x", "-y", f"-o{tmp}", str(rar_path)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
        elif extractor == "unrar":
            subprocess.run(
                [extractor, "x", "-y", str(rar_path), tmp], check=True, stdout=subprocess.DEVNULL
            )
        elif extractor == "unar":
            subprocess.run(
                [extractor, "-q", "-o", tmp, str(rar_path)], check=True, stdout=subprocess.DEVNULL
            )
        else:  # bsdtar
            subprocess.run([extractor, "-xf", str(rar_path), "-C", tmp], check=True)
        gpkg = next(Path(tmp).rglob("*.gpkg"))
        target = INEI_DIR / gpkg.name.upper()
        shutil.move(str(gpkg), target)
    return target


def seed_inei_boundaries(db: Session) -> int:
    """Carga los polígonos distritales de INEI y deriva provincias/departamentos.

    Los 16+ distritos creados tras el catálogo ubigeo se añaden a
    admin_division (parent = prefijo de 4 dígitos del ubigeo).
    Devuelve el número de distritos con geometría.
    """
    gpkg = _ensure_inei_gpkg()
    con = sqlite3.connect(gpkg)
    rows = con.execute(
        "SELECT ubigeo, nombdist, geom FROM DISTRITO WHERE geom IS NOT NULL"
    ).fetchall()
    con.close()
    if not rows:
        raise RuntimeError(f"{gpkg} no tiene geometrías")

    # Distritos nuevos respecto del catálogo ubigeo: darlos de alta primero
    existing_codes = {
        d.code
        for d in db.scalars(
            select(AdminDivision).where(AdminDivision.countryCode == "PE", AdminDivision.level == 3)
        )
    }
    nuevos = {r[0]: (str(r[1]).title(), r[0]) for r in rows if r[0] not in existing_codes}
    if nuevos:
        upsert_divisions(db, "PE", 3, nuevos, source="INEI")
        link_parents(db, "PE", 3, {code: code[:4] for code in nuevos})
        print(f"[seed] PE: {len(nuevos)} distritos nuevos añadidos al catálogo")

    update = text(
        "UPDATE admin_division "
        "SET boundary = ST_Multi(ST_MakeValid(ST_GeomFromWKB(:wkb, 4326))) "
        "WHERE country_code = 'PE' AND level = 3 AND code = :ubigeo"
    )
    for ubigeo, _name, geom in rows:
        db.execute(update, {"wkb": _gpkg_wkb(geom), "ubigeo": ubigeo})

    # Provincia y departamento: unión de sus distritos
    db.execute(
        text(
            "UPDATE admin_division p SET boundary = u.g FROM ("
            "  SELECT substr(code, 1, 4) AS pref, "
            "         ST_Multi(ST_UnaryUnion(ST_Collect(boundary))) AS g"
            "  FROM admin_division"
            "  WHERE country_code = 'PE' AND level = 3 AND boundary IS NOT NULL"
            "  GROUP BY substr(code, 1, 4)"
            ") u WHERE p.country_code = 'PE' AND p.level = 2 AND p.code = u.pref"
        )
    )
    db.execute(
        text(
            "UPDATE admin_division d SET boundary = u.g FROM ("
            "  SELECT substr(code, 1, 2) AS pref, "
            "         ST_Multi(ST_UnaryUnion(ST_Collect(boundary))) AS g"
            "  FROM admin_division"
            "  WHERE country_code = 'PE' AND level = 2 AND boundary IS NOT NULL"
            "  GROUP BY substr(code, 1, 2)"
            ") u WHERE d.country_code = 'PE' AND d.level = 1 AND d.code = u.pref"
        )
    )

    n3 = db.scalar(
        select(func.count())
        .select_from(AdminDivision)
        .where(
            AdminDivision.countryCode == "PE",
            AdminDivision.level == 3,
            AdminDivision.boundary.isnot(None),
        )
    )
    print(f"[seed] PE: {n3} distritos con polígono oficial INEI")
    return n3


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--adm3",
        default="",
        help="Códigos ISO separados por coma para cargar nivel 3 desde GeoNames (p.ej. BR,MX)",
    )
    args = parser.parse_args()
    adm3_countries = [c.strip().upper() for c in args.adm3.split(",") if c.strip()]

    ensure_database_extensions()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        upsert_countries(db, adm3_countries)
        seed_peru(db)
        seed_geonames(db, adm3_countries)
        db.commit()

        try:
            seed_inei_boundaries(db)
        except Exception as exc:  # sin red/extractor: el catálogo textual queda sembrado
            db.rollback()
            print(f"[seed] AVISO: sin polígonos INEI ({exc})")
        else:
            db.commit()

        countries = db.scalar(select(func.count()).select_from(Country))
        divs = db.scalar(select(func.count()).select_from(AdminDivision))
        print(f"[seed] OK — {countries} países, {divs} divisiones administrativas.")
        rows = db.execute(
            select(AdminDivision.level, func.count())
            .where(AdminDivision.countryCode == "PE")
            .group_by(AdminDivision.level)
        ).all()
        print("[seed] PE: " + ", ".join(f"nivel {lv}: {n}" for lv, n in sorted(rows)))
        geonames_count = db.scalar(
            select(func.count())
            .select_from(AdminDivision)
            .where(AdminDivision.source == "GEONAMES")
        )
        print(f"[seed] GeoNames (todos los países): {geonames_count} divisiones.")
        boundaries = db.scalar(
            select(func.count())
            .select_from(AdminDivision)
            .where(AdminDivision.boundary.isnot(None))
        )
        print(f"[seed] Polígonos INEI cargados: {boundaries}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
