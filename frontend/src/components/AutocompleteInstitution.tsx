import { useRef, useState } from "react";
import { Input } from "./ui/input";
import { API, PAGE_SIZE } from "@constants/api";
import { BasicInstitutionInfo, InstitutionPage, pageToBasicInstitutionInfo } from "@interfaces/institution";
import { AutocompleteDropdown, useSuggestions } from "./ui/autocomplete";

export function AutocompleteInstitution({
  token,
  apiFetch,
  placeholder = "Buscar institución...",
  disabled = false,
  value,
  onChange,
  onSelect,
  minChars = 1,
}: {
  token: string;
  apiFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
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
    async (q) => {
      const params = new URLSearchParams({ namePrefix: q, limit: String(PAGE_SIZE.INSTITUTIONS) });
      const res = await apiFetch(`${API.BASE_URL}${API.PATHS.INSTITUTIONS.BASE}?${params.toString()}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return pageToBasicInstitutionInfo((await res.json()) as InstitutionPage);
    },
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
