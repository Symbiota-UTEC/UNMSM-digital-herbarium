import { useRef, useState } from "react";
import { Input } from "./ui/input";
import { PAGE_SIZE } from "@constants/api";
import { BasicInstitutionInfo, pageToBasicInstitutionInfo } from "@interfaces/institution";
import { institutionsService } from "@services/institutions.service";
import type { ApiFetch } from "@services/api.error";
import { AutocompleteDropdown, useSuggestions } from "./ui/autocomplete";

export function AutocompleteInstitution({
  apiFetch,
  placeholder = "Buscar institución...",
  disabled = false,
  value,
  onChange,
  onSelect,
  minChars = 1,
}: {
  apiFetch: ApiFetch;
  placeholder?: string;
  disabled?: boolean;
  value: string;
  onChange: (text: string) => void;
  onSelect: (item: BasicInstitutionInfo) => void;
  minChars?: number;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items: options, loading } = useSuggestions<BasicInstitutionInfo>(
    async (q) => pageToBasicInstitutionInfo(await institutionsService.search(apiFetch, q, PAGE_SIZE.INSTITUTIONS)),
    value,
    { minChars, enabled: !disabled },
  );

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === "Enter") e.preventDefault();
          }}
          className="pr-8"
        />
      </div>

      {open && !disabled && value.trim().length >= minChars && (
        <AutocompleteDropdown
          items={options}
          loading={loading}
          keyOf={(opt, i) => opt.institutionId ?? String(i)}
          renderItem={(opt) => <span className="truncate">{opt.institutionName}</span>}
          onSelect={(opt) => {
            onSelect(opt);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
