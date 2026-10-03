const DWC_HEADER = /^dwc:(Occurrence|Event|Location|Taxon|Identification):([A-Za-z_][A-Za-z0-9_]*)$/;

export const preparedDwcTarget = (header: string): string | null => {
  const match = DWC_HEADER.exec(header.trim());
  return match ? `${match[1]}.${match[2]}` : null;
};

/** Recognize prepared files structurally; the API remains authoritative for allowed fields. */
export const isPreparedDwcCsv = (headers: string[]): boolean => {
  const names = headers.map((header) => header.trim());
  return (
    names.includes("dwc:Occurrence:catalogNumber") &&
    new Set(names).size === names.length &&
    names.every((name) => preparedDwcTarget(name) !== null)
  );
};

/** Prepared CSV text must bypass the mapper, which otherwise rebuilds JSON cells. */
export const preparedDwcText = (headers: string[], text: string): string | null =>
  isPreparedDwcCsv(headers) ? text : null;
