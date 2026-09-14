import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/input";
import { API, PAGE_SIZE } from "@constants/api";
import {
    BasicInstitutionInfo,
    InstitutionPage,
    pageToBasicInstitutionInfo,
} from "@interfaces/institution";
import { Search } from "lucide-react";

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
    const [options, setOptions] = useState<BasicInstitutionInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchOptions = async (query: string) => {
        if (disabled) return;
        const q = query.trim();
        if (q.length < minChars) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ namePrefix: q, limit: String(PAGE_SIZE.INSTITUTIONS) });
            const res = await apiFetch(
                `${API.BASE_URL}${API.PATHS.INSTITUTIONS.BASE}?${params.toString()}`,
                { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) { setOptions([]); setOpen(false); return; }
            const data = (await res.json()) as InstitutionPage;
            const items = pageToBasicInstitutionInfo(data);
            setOptions(items);
            setOpen(items.length > 0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (disabled || value.trim().length < minChars) {
            setOptions([]);
            setOpen(false);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchOptions(value), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, disabled]);

    return (
        <div className="relative">
            <div className="relative">
                <Input
                    ref={inputRef}
                    placeholder={placeholder}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => { onChange(e.target.value); }}
                    onFocus={() => { if (options.length > 0) setOpen(true); }}
                    onBlur={() => setTimeout(() => setOpen(false), 120)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
                        if (e.key === "Enter") { e.preventDefault(); if (!disabled) fetchOptions(value); }
                    }}
                    className="pr-8"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Search className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
                    </div>
                )}
            </div>

            {open && options.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                    <ul className="max-h-56 overflow-y-auto py-1">
                        {options.map((opt) => (
                            <li key={opt.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                                    style={{ color: "var(--foreground)" }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onSelect(opt);
                                        setOptions([]);
                                        setOpen(false);
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                >
                                    <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{opt.institutionName}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
