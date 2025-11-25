import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { API, PAGE_SIZE} from "@constants/api";
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
    const [isFocused, setIsFocused] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const canSearch = !disabled && value.trim().length >= minChars && !loading;

    useEffect(() => {
        if (!value.trim()) {
            setOptions([]);
            setOpen(false);
        }
    }, [value]);

    const fetchOptions = async (query: string) => {
        if (disabled) return;
        const q = query.trim();
        if (q.length < minChars) return;

        try {
            setLoading(true);

            const params = new URLSearchParams({ namePrefix: q, limit: String(PAGE_SIZE.INSTITUTIONS) });

            const res = await apiFetch(
                `${API.BASE_URL}${API.PATHS.INSTITUTIONS}?${params.toString()}`,
                { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
            );

            if (!res.ok) {
                setOptions([]);
                setOpen(false);
                return;
            }

            const data = (await res.json()) as InstitutionPage;
            const items = pageToBasicInstitutionInfo(data);

            setOptions(items);
            setOpen(items.length > 0);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchClick = () => {
        if (!canSearch) return;
        fetchOptions(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (canSearch) fetchOptions(value);
        }
        if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <div className="relative">
            {/* Input + botón a la derecha */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Input
                        ref={inputRef}
                        placeholder={placeholder}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value)}
                        onFocus={() => {
                            setIsFocused(true);
                            if (options.length > 0) setOpen(true);
                        }}
                        onBlur={() => {
                            setIsFocused(false);
                            setOpen(false);
                        }}
                        onKeyDown={handleKeyDown}
                    />

                    {open && (
                        <Card
                            className="absolute left-0 right-0 top-full mt-1 z-50 max-h-72 overflow-auto p-1 shadow-lg"
                            // Evita que el click dentro cierre por blur del input
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            {loading && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>
                            )}

                            {!loading && options.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                            )}

                            {!loading && options.length > 0 && (
                                <ul role="listbox" className="py-1">
                                    {options.map((opt) => (
                                        <li
                                            key={opt.id}
                                            role="option"
                                            tabIndex={0}
                                            className="px-3 py-2 rounded-md cursor-pointer hover:bg-muted focus:bg-muted focus:outline-none focus-visible:outline-none"
                                            // Selecciona ANTES del blur del input
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                onSelect(opt);
                                                setOptions([]);
                                                setOpen(false);
                                                setIsFocused(false);
                                                inputRef.current?.blur();
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    onSelect(opt);
                                                    setOptions([]);
                                                    setOpen(false);
                                                    setIsFocused(false);
                                                    inputRef.current?.blur();
                                                }
                                            }}
                                        >
                                            <span className="block truncate">{opt.institutionName}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    )}
                </div>

                <Button
                    type="button"
                    size="icon"
                    variant="default"
                    disabled={!canSearch}
                    onClick={handleSearchClick}
                    aria-label="Buscar"
                    title="Buscar"
                >
                    <Search className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
