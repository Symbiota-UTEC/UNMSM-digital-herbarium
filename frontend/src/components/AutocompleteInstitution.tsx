import { useEffect, useRef, useState } from "react"; // <-- agrega useRef
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { useDebounce } from "@utils/useDebounce";
import { API } from "@constants/api";
import { BasicInstitutionInfo, InstitutionPage, pageToBasicInstitutionInfo } from "@interfaces/institution";

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
    const debounced = useDebounce(value, 250);

    useEffect(() => {
        if (disabled) return;
        const q = debounced.trim();
        if (q.length < minChars) {
            setOptions([]);
            setOpen(false);
            return;
        }
        let aborted = false;
        (async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({
                    limit: "7",
                    offset: "0",
                    name_prefix: q,
                });
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
                if (!aborted) {
                    setOptions(items);
                    setOpen(items.length > 0 && isFocused);
                }
            } finally {
                !aborted && setLoading(false);
            }
        })();
        return () => { aborted = true; };
    }, [debounced, apiFetch, token, disabled, minChars, isFocused]);

    return (
        <div className="relative">
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
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        setOpen(false);
                        inputRef.current?.blur();
                    }
                }}
            />

            {open && (
                <Card className="absolute z-50 mt-1 w-full max-h-64 overflow-auto p-1 shadow-lg">
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
                                    className="px-3 py-2 rounded-md cursor-pointer
                       hover:bg-muted focus:bg-muted
                       focus:outline-none focus-visible:outline-none"
                                    // Selecciona ANTES del blur del input
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onSelect(opt);
                                        setOptions([]);        // evita reabrir por estado viejo
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
    );
}
