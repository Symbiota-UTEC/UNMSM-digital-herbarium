"""Formateo de fechas para mostrar (no para almacenar ni filtrar)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional


def format_display_date(value: Optional[datetime | date | str]) -> Optional[str]:
    """Normaliza una fecha a 'dd/mm/aaaa' para mostrarla.

    - datetime/date: se formatea directo.
    - str: intenta parsear ISO u otros formatos comunes; si no puede (fecha parcial o rango
      Darwin Core, p.ej. "1998" o "1998-05/1998-06"), devuelve el mismo string sin tocarlo —
      nunca hay que fabricar un día/mes que el dato original no tenía.
    - None: None.
    """
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%d/%m/%Y")
    s = value.strip()
    if not s:
        return None
    s2 = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s2).strftime("%d/%m/%Y")
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s
