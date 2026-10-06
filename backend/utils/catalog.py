"""Validation shared by occurrence forms and Darwin Core imports."""

import re


def normalize_catalog_number(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("catalogNumber debe ser una cadena de dígitos")
    catalog_number = value.strip()
    if not re.fullmatch(r"[0-9]{1,100}", catalog_number):
        raise ValueError("catalogNumber debe contener entre 1 y 100 dígitos (sin prefijo)")
    return catalog_number


def normalize_institution_code(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("institutionCode debe ser una cadena")
    code = value.strip()
    if not code:
        raise ValueError("institutionCode no puede estar vacío")
    return code
