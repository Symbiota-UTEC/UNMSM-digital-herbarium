export type DwCEntity =
  | "Occurrence"
  | "Event"
  | "Location"
  | "Taxon"
  | "Identification";

export interface DwCFieldOption {
  value: string;
  label: string;
  entity: DwCEntity;
  term: string;
  /** "nice to have" según tu modelo */
  recommended?: boolean;
  /** Obligatorio según tu modelo */
  required?: boolean;
  /** Si aparece en los formularios estándar */
  inForm?: boolean;
  /** Descripción breve en español para usar en formularios */
  helpEs?: string;
}

export const DWC_FIELDS: Record<string, DwCFieldOption[]> = {
  // ============================================================
  // OCCURRENCE (núcleo)  - Obligatorios / Nice to have / Opcionales
  // ============================================================
  Occurrence: [
    // ---------- OBLIGATORIOS ----------
    {
      entity: "Occurrence",
      term: "catalogNumber",
      value: "Occurrence.catalogNumber",
      label: "dwc:Occurrence:catalogNumber",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Número o código de catálogo asignado al ejemplar o registro (número de pliego, etc.).",
    },
    {
      entity: "Occurrence",
      term: "recordNumber",
      value: "Occurrence.recordNumber",
      label: "dwc:Occurrence:recordNumber",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Número de colecta asignado por el colector (número de campo).",
    },
    {
      entity: "Occurrence",
      term: "recordedBy",
      value: "Occurrence.recordedBy",
      label: "dwc:Occurrence:recordedBy",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Nombre(s) de la(s) persona(s) que observaron o recolectaron, en orden de importancia.",
    },
    // ---------- DESEABLES (nice to have) ----------
    {
      entity: "Occurrence",
      term: "organismQuantity",
      value: "Occurrence.organismQuantity",
      label: "dwc:Occurrence:organismQuantity",
      recommended: true,
      inForm: true,
      helpEs:
        "Cantidad de organismos (número, cobertura, biomasa, etc.).",
    },
    {
      entity: "Occurrence",
      term: "organismQuantityType",
      value: "Occurrence.organismQuantityType",
      label: "dwc:Occurrence:organismQuantityType",
      recommended: true,
      inForm: true,
      helpEs:
        "Tipo de unidad usada en organismQuantity (individuos, ramas, colonias, etc.).",
    },
    {
      entity: "Occurrence",
      term: "georeferenceVerificationStatus",
      value: "Occurrence.georeferenceVerificationStatus",
      label: "dwc:Occurrence:georeferenceVerificationStatus",
      recommended: true,
      inForm: true,
      helpEs:
        "Estado de verificación de la georreferenciación (p. ej., verificado, no verificado).",
    },
    // ---------- OPCIONALES ----------
    {
      entity: "Occurrence",
      term: "lifeStage",
      value: "Occurrence.lifeStage",
      label: "dwc:Occurrence:lifeStage",
      inForm: true,
      helpEs:
        "Etapa de vida del organismo (plántula, adulto, flor, fruto, etc.).",
    },
    {
      entity: "Occurrence",
      term: "occurrenceRemarks",
      value: "Occurrence.occurrenceRemarks",
      label: "dwc:Occurrence:occurrenceRemarks",
      inForm: true,
      helpEs:
        "Notas adicionales sobre la ocurrencia (fenología, microhábitat, sustrato, etc.).",
    },
    {
      entity: "Occurrence",
      term: "establishmentMeans",
      value: "Occurrence.establishmentMeans",
      label: "dwc:Occurrence:establishmentMeans",
      inForm: true,
      helpEs:
        "Forma de establecimiento en el lugar (nativa, introducida, cultivada, etc.).",
    },
    {
      entity: "Occurrence",
      term: "associatedReferences",
      value: "Occurrence.associatedReferences",
      label: "dwc:Occurrence:associatedReferences",
      inForm: true,
      helpEs:
        "Referencias bibliográficas asociadas a esta ocurrencia en particular.",
    },
    {
      entity: "Occurrence",
      term: "associatedTaxa",
      value: "Occurrence.associatedTaxa",
      label: "dwc:Occurrence:associatedTaxa",
      inForm: true,
      helpEs:
        "Taxones asociados (huésped, parásito, simbionte, forófito, etc.).",
    },
    {
      entity: "Occurrence",
      term: "dynamicProperties",
      value: "Occurrence.dynamicProperties",
      label: "dwc:Occurrence:dynamicProperties",
      inForm: false,
      helpEs:
        "Propiedades adicionales por registro en formato JSON (clave-valor).",
    },
  ],

  // ============================================================
  // EVENT (parte de la tabla occurrence, pero como DwC:Event)
  // ============================================================
  Event: [
    // ---------- OBLIGATORIO ----------
    {
      entity: "Event",
      term: "verbatimEventDate",
      value: "Event.verbatimEventDate",
      label: "dwc:Event:verbatimEventDate",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Fecha del evento tal como aparece en la etiqueta o fuente original (texto libre).",
    },

    // ---------- DESEABLES (nice to have) ----------
    {
      entity: "Event",
      term: "eventDate",
      value: "Event.eventDate",
      label: "dwc:Event:eventDate",
      recommended: true,
      inForm: true,
      helpEs:
        "Fecha (o rango) normalizada del evento en formato ISO 8601.",
    },
    {
      entity: "Event",
      term: "year",
      value: "Event.year",
      label: "dwc:Event:year",
      recommended: true,
      inForm: true,
      helpEs: "Año del evento de colecta (extraído o derivado).",
    },
    {
      entity: "Event",
      term: "month",
      value: "Event.month",
      label: "dwc:Event:month",
      recommended: true,
      inForm: true,
      helpEs: "Mes del evento de colecta (1-12).",
    },
    {
      entity: "Event",
      term: "day",
      value: "Event.day",
      label: "dwc:Event:day",
      recommended: true,
      inForm: true,
      helpEs: "Día del mes del evento de colecta (1-31).",
    },
    {
      entity: "Event",
      term: "habitat",
      value: "Event.habitat",
      label: "dwc:Event:habitat",
      recommended: true,
      inForm: true,
      helpEs: "Descripción del hábitat donde se realizó la colecta.",
    },
    {
      entity: "Event",
      term: "eventRemarks",
      value: "Event.eventRemarks",
      label: "dwc:Event:eventRemarks",
      recommended: true,
      inForm: true,
      helpEs:
        "Notas adicionales sobre el evento de muestreo (condiciones, clima, etc.).",
    },

    // ---------- OPCIONALES ----------
    {
      entity: "Event",
      term: "fieldNotes",
      value: "Event.fieldNotes",
      label: "dwc:Event:fieldNotes",
      inForm: true,
      helpEs: "Notas de campo tal como en la libreta de campo.",
    },
  ],

  // ============================================================
  // LOCATION (parte de la tabla occurrence)
  // ============================================================
  Location: [
    // ---------- OBLIGATORIOS ----------
    {
      entity: "Location",
      term: "country",
      value: "Location.country",
      label: "dwc:Location:country",
      required: true,
      recommended: true,
      inForm: true,
      helpEs: "País donde se encuentra la localidad (p. ej., Perú).",
    },
    {
      entity: "Location",
      term: "stateProvince",
      value: "Location.stateProvince",
      label: "dwc:Location:stateProvince",
      required: true,
      recommended: true,
      inForm: true,
      helpEs: "Departamento/región o primera división política.",
    },
    {
      entity: "Location",
      term: "verbatimLocality",
      value: "Location.verbatimLocality",
      label: "dwc:Location:verbatimLocality",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Descripción textual de la localidad tal como aparece en la etiqueta.",
    },

    // ---------- DESEABLES (nice to have) ----------
    {
      entity: "Location",
      term: "verbatimElevation",
      value: "Location.verbatimElevation",
      label: "dwc:Location:verbatimElevation",
      recommended: true,
      inForm: true,
      helpEs:
        "Elevación tal como aparece en la etiqueta (con unidades, rangos, etc.).",
    },
    {
      entity: "Location",
      term: "county",
      value: "Location.county",
      label: "dwc:Location:county",
      recommended: true,
      inForm: true,
      helpEs: "Provincia o segunda división política.",
    },
    {
      entity: "Location",
      term: "municipality",
      value: "Location.municipality",
      label: "dwc:Location:municipality",
      recommended: true,
      inForm: true,
      helpEs: "Distrito/municipio u otra división local.",
    },
    {
      entity: "Location",
      term: "locality",
      value: "Location.locality",
      label: "dwc:Location:locality",
      recommended: true,
      inForm: true,
      helpEs:
        "Localidad oficial (centro poblado, caserío, sitio descriptivo normalizado).",
    },
    {
      entity: "Location",
      term: "locationRemarks",
      value: "Location.locationRemarks",
      label: "dwc:Location:locationRemarks",
      recommended: true,
      inForm: true,
      helpEs:
        "Notas u observaciones adicionales sobre la ubicación (caminos, referencias locales, etc.).",
    },
    {
      entity: "Location",
      term: "decimalLatitude",
      value: "Location.decimalLatitude",
      label: "dwc:Location:decimalLatitude",
      recommended: true,
      inForm: true,
      helpEs: "Latitud en grados decimales (WGS84).",
    },
    {
      entity: "Location",
      term: "decimalLongitude",
      value: "Location.decimalLongitude",
      label: "dwc:Location:decimalLongitude",
      recommended: true,
      inForm: true,
      helpEs: "Longitud en grados decimales (WGS84).",
    },
    // ---------- OPCIONALES ----------
    {
      entity: "Location",
      term: "countryCode",
      value: "Location.countryCode",
      label: "dwc:Location:countryCode",
      inForm: true,
      helpEs:
        "Código del país ISO 3166-1 alfa-2 (p. ej., PE, BR, EC).",
    },
    {
      entity: "Location",
      term: "hydrographicContext",
      value: "Location.hydrographicContext",
      label: "dwc:Location:hydrographicContext",
      inForm: true,
      helpEs:
        "Contexto hidrográfico: cuerpo de agua, archipiélago o isla específica (unifica waterBody, islandGroup, island).",
    },
    {
      entity: "Location",
      term: "footprintWKT",
      value: "Location.footprintWKT",
      label: "dwc:Location:footprintWKT",
      inForm: false,
      helpEs:
        "Polígono o área de la ocurrencia en formato WKT (p. ej., área de muestreo).",
    },
  ],

  // ============================================================
  // TAXON (solo nombre científico + autoría, como pediste)
  // ============================================================
  Taxon: [
    {
      entity: "Taxon",
      term: "scientificName",
      value: "Taxon.scientificName",
      label: "dwc:Taxon:scientificName",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Nombre científico completo aplicado al espécimen (p. ej., Piper aduncum L.).",
    },
    {
      entity: "Taxon",
      term: "scientificNameAuthorship",
      value: "Taxon.scientificNameAuthorship",
      label: "dwc:Taxon:scientificNameAuthorship",
      required: true,
      recommended: true,
      inForm: true,
      helpEs:
        "Autoría del nombre científico (autor o autores, y opcionalmente año).",
    },
  ],

  // ============================================================
  // IDENTIFICATION (solo identifiedBy e identifiedByID)
  // ============================================================
  Identification: [
    {
      entity: "Identification",
      term: "identifiedBy",
      value: "Identification.identifiedBy",
      label: "dwc:Identification:identifiedBy",
      recommended: true,
      inForm: true,
      helpEs:
        "Persona(s) que identificaron taxonómicamente el espécimen.",
    },
    {
      entity: "Identification",
      term: "identifiedByID",
      value: "Identification.identifiedByID",
      label: "dwc:Identification:identifiedByID",
      recommended: true,
      inForm: true,
      helpEs:
        "Identificador interno del agente que realizó la identificación.",
    },
  ],
};
