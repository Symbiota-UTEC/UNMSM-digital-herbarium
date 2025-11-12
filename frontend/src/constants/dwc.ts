export type DwCEntity = "Occurrence" | "Event" | "Location" | "Taxon";

export interface DwCFieldOption {
    value: string;
    label: string;
    entity: DwCEntity;
    term: string;
    recommended?: boolean;
    required?: boolean;
    /** Descripción breve en español para usar en formularios */
    helpEs?: string;
}

export const DWC_FIELDS: Record<string, DwCFieldOption[]> = {
    Occurrence: [
        { entity: "Occurrence", term: "occurrenceID", value: "Occurrence.occurrenceID", label: "dwc:Occurrence:occurrenceID", helpEs: "Identificador único del registro de ocurrencia." },
        { entity: "Occurrence", term: "catalogNumber", value: "Occurrence.catalogNumber", label: "dwc:Occurrence:catalogNumber", required: true, recommended: true, helpEs: "Número o código de catálogo asignado al ejemplar o registro." },
        { entity: "Occurrence", term: "recordNumber", value: "Occurrence.recordNumber", label: "dwc:Occurrence:recordNumber", helpEs: "Número de campo de la colecta (asignado por el colector)." },
        { entity: "Occurrence", term: "recordedBy", value: "Occurrence.recordedBy", label: "dwc:Occurrence:recordedBy", recommended: true, helpEs: "Nombre(s) de la persona que observó o recolectó." },
        { entity: "Occurrence", term: "recordEnteredBy", value: "Occurrence.recordEnteredBy", label: "dwc:Occurrence:recordEnteredBy", helpEs: "Persona que digitó o ingresó el registro." },
        { entity: "Occurrence", term: "individualCount", value: "Occurrence.individualCount", label: "dwc:Occurrence:individualCount", helpEs: "Número de individuos observados o recolectados." },
        { entity: "Occurrence", term: "occurrenceStatus", value: "Occurrence.occurrenceStatus", label: "dwc:Occurrence:occurrenceStatus", helpEs: "Estado de la ocurrencia (p. ej., presente/ausente)." },
        { entity: "Occurrence", term: "preparations", value: "Occurrence.preparations", label: "dwc:Occurrence:preparations", helpEs: "Tipo de preparación del material (p. ej., herbario, tejido, alcohol)." },
        { entity: "Occurrence", term: "disposition", value: "Occurrence.disposition", label: "dwc:Occurrence:disposition", helpEs: "Situación del ejemplar (en colección, prestado, perdido, etc.)." },
        { entity: "Occurrence", term: "occurrenceRemarks", value: "Occurrence.occurrenceRemarks", label: "dwc:Occurrence:occurrenceRemarks", helpEs: "Observaciones adicionales sobre la ocurrencia." },
        { entity: "Occurrence", term: "modified", value: "Occurrence.modified", label: "dwc:Occurrence:modified", helpEs: "Fecha/hora de la última modificación del registro." },
        { entity: "Occurrence", term: "license", value: "Occurrence.license", label: "dwc:Occurrence:license", helpEs: "Licencia de uso de los datos (p. ej., CC BY 4.0)." },
        { entity: "Occurrence", term: "rightsHolder", value: "Occurrence.rightsHolder", label: "dwc:Occurrence:rightsHolder", helpEs: "Titular de los derechos del registro o contenido." },
        { entity: "Occurrence", term: "accessRights", value: "Occurrence.accessRights", label: "dwc:Occurrence:accessRights", helpEs: "Condiciones o restricciones de acceso a los datos." },
        { entity: "Occurrence", term: "bibliographicCitation", value: "Occurrence.bibliographicCitation", label: "dwc:Occurrence:bibliographicCitation", helpEs: "Referencia sugerida para citar este registro." },
        { entity: "Occurrence", term: "dynamicProperties", value: "Occurrence.dynamicProperties", label: "dwc:Occurrence:dynamicProperties", helpEs: "Propiedades adicionales en formato JSON por registro." },
    ],

    Event: [
        { entity: "Event", term: "eventDate", value: "Event.eventDate", label: "dwc:Event:eventDate", recommended: true, helpEs: "Fecha (o rango) del evento de colecta/observación." },
        { entity: "Event", term: "year", value: "Event.year", label: "dwc:Event:year", helpEs: "Año del evento." },
        { entity: "Event", term: "month", value: "Event.month", label: "dwc:Event:month", helpEs: "Mes del evento (1–12)." },
        { entity: "Event", term: "day", value: "Event.day", label: "dwc:Event:day", helpEs: "Día del evento (1–31)." },
        { entity: "Event", term: "verbatimEventDate", value: "Event.verbatimEventDate", label: "dwc:Event:verbatimEventDate", helpEs: "Fecha tal como aparece en la fuente original (texto libre)." },
        { entity: "Event", term: "fieldNumber", value: "Event.fieldNumber", label: "dwc:Event:fieldNumber", helpEs: "Código o número del evento de campo." },
        { entity: "Event", term: "samplingProtocol", value: "Event.samplingProtocol", label: "dwc:Event:samplingProtocol", helpEs: "Protocolo o método de muestreo empleado." },
        { entity: "Event", term: "samplingEffort", value: "Event.samplingEffort", label: "dwc:Event:samplingEffort", helpEs: "Esfuerzo de muestreo (p. ej., horas, trampas, transectos)." },
        { entity: "Event", term: "habitat", value: "Event.habitat", label: "dwc:Event:habitat", helpEs: "Descripción del hábitat donde ocurrió el evento." },
        { entity: "Event", term: "eventRemarks", value: "Event.eventRemarks", label: "dwc:Event:eventRemarks", helpEs: "Observaciones o notas sobre el evento." },
    ],

    Location: [
        { entity: "Location", term: "stateProvince", value: "Location.stateProvince", label: "dwc:Location:stateProvince", helpEs: "Departamento/estado o primera división política." },
        { entity: "Location", term: "county", value: "Location.county", label: "dwc:Location:county", helpEs: "Provincia/condado o segunda división política." },
        { entity: "Location", term: "municipality", value: "Location.municipality", label: "dwc:Location:municipality", helpEs: "Municipio/distrito u otra división local." },
        { entity: "Location", term: "locality", value: "Location.locality", label: "dwc:Location:locality", recommended: true, helpEs: "Descripción de la localidad (sitio) de la colecta/observación." },
        { entity: "Location", term: "verbatimLocality", value: "Location.verbatimLocality", label: "dwc:Location:verbatimLocality", helpEs: "Localidad tal como aparece en la fuente original." },
        { entity: "Location", term: "decimalLatitude", value: "Location.decimalLatitude", label: "dwc:Location:decimalLatitude", helpEs: "Latitud en grados decimales (WGS84 u otro datum indicado)." },
        { entity: "Location", term: "decimalLongitude", value: "Location.decimalLongitude", label: "dwc:Location:decimalLongitude", helpEs: "Longitud en grados decimales (WGS84 u otro datum indicado)." },
        { entity: "Location", term: "geodeticDatum", value: "Location.geodeticDatum", label: "dwc:Location:geodeticDatum", helpEs: "Datum geodésico de las coordenadas (p. ej., WGS84)." },
        { entity: "Location", term: "coordinateUncertaintyInMeters", value: "Location.coordinateUncertaintyInMeters", label: "dwc:Location:coordinateUncertaintyInMeters", helpEs: "Incertidumbre de las coordenadas en metros." },
        { entity: "Location", term: "coordinatePrecision", value: "Location.coordinatePrecision", label: "dwc:Location:coordinatePrecision", helpEs: "Precisión numérica de las coordenadas (número de decimales)." },
        { entity: "Location", term: "minimumElevationInMeters", value: "Location.minimumElevationInMeters", label: "dwc:Location:minimumElevationInMeters", helpEs: "Elevación mínima en metros." },
        { entity: "Location", term: "maximumElevationInMeters", value: "Location.maximumElevationInMeters", label: "dwc:Location:maximumElevationInMeters", helpEs: "Elevación máxima en metros." },
        { entity: "Location", term: "verbatimElevation", value: "Location.verbatimElevation", label: "dwc:Location:verbatimElevation", helpEs: "Elevación tal como aparece en la fuente original (texto libre)." },
    ],

    Taxon: [
        { entity: "Taxon", term: "scientificName", value: "Taxon.scientificName", label: "dwc:Taxon:scientificName", required: true, recommended: true, helpEs: "Nombre científico completo (p. ej., Genus species Autor, año)." },
        { entity: "Taxon", term: "scientificNameAuthorship", value: "Taxon.scientificNameAuthorship", label: "dwc:Taxon:scientificNameAuthorship", helpEs: "Autoría del nombre científico (autor y año)." },
        { entity: "Taxon", term: "family", value: "Taxon.family", label: "dwc:Taxon:family", recommended: true, helpEs: "Familia taxonómica." },
        { entity: "Taxon", term: "genus", value: "Taxon.genus", label: "dwc:Taxon:genus", recommended: true, helpEs: "Género taxonómico." },
        { entity: "Taxon", term: "specificEpithet", value: "Taxon.specificEpithet", label: "dwc:Taxon:specificEpithet", helpEs: "Epíteto específico (parte de la especie)." },
        { entity: "Taxon", term: "infraspecificEpithet", value: "Taxon.infraspecificEpithet", label: "dwc:Taxon:infraspecificEpithet", helpEs: "Epíteto infraespecífico (subsp., var., etc.)." },
        { entity: "Taxon", term: "taxonRank", value: "Taxon.taxonRank", label: "dwc:Taxon:taxonRank", helpEs: "Rango taxonómico del nombre (especie, subespecie, etc.)." },
        { entity: "Taxon", term: "acceptedNameUsage", value: "Taxon.acceptedNameUsage", label: "dwc:Taxon:acceptedNameUsage", helpEs: "Nombre aceptado en caso de sinónimos o combinaciones." }
    ]
};
