// src/components/MapSearchDialog.tsx
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { MapPin, Crosshair } from "lucide-react";

import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Modify from "ol/interaction/Modify";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialCenter?: [number, number]; // [lng, lat]
    onConfirm: (p: {
        lat: number;
        lon: number;
        country?: string;
        state?: string;
        county?: string;
        municipality?: string;
        localityLabel?: string;
    }) => void;
};

const waitUntilVisible = async (el: HTMLElement, timeoutMs = 1500) => {
    const start = performance.now();
    return new Promise<void>((resolve) => {
        const tick = () => {
            const visible = el.offsetWidth > 0 && el.offsetHeight > 0;
            const expired = performance.now() - start > timeoutMs;
            if (visible || expired) resolve();
            else requestAnimationFrame(tick);
        };
        tick();
    });
};

export function MapSearchDialog({
                                    open,
                                    onOpenChange,
                                    initialCenter = [-77.042793, -12.046374],
                                    onConfirm,
                                }: Props) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const markerFeatureRef = useRef<Feature<Point> | null>(null);
    const resizeObsRef = useRef<ResizeObserver | null>(null);

    const [lng, setLng] = useState(initialCenter[0]);
    const [lat, setLat] = useState(initialCenter[1]);
    const [loadingLocation, setLoadingLocation] = useState(false);

    useEffect(() => {
        if (!open) return;
        const host = hostRef.current;
        if (!host) return;
        let disposed = false;

        (async () => {
            await waitUntilVisible(host);

            // Limpieza previa
            try {
                resizeObsRef.current?.disconnect();
                mapRef.current?.setTarget(undefined as any);
            } catch {}
            resizeObsRef.current = null;
            mapRef.current = null;
            markerFeatureRef.current = null;

            const center3857 = fromLonLat([initialCenter[0], initialCenter[1]]);
            const base = new TileLayer({ source: new OSM() });

            const markerFeature = new Feature<Point>(new Point(center3857));
            markerFeature.setStyle(
                new Style({
                    image: new CircleStyle({
                        radius: 8,
                        fill: new Fill({ color: "#b91c1c" }),
                        stroke: new Stroke({ color: "#fff", width: 2 }),
                    }),
                })
            );

            const vSource = new VectorSource({ features: [markerFeature] });
            const vLayer = new VectorLayer({ source: vSource });

            const map = new Map({
                target: host,
                layers: [base, vLayer],
                view: new View({ center: center3857, zoom: 12 }),
                controls: [],
            });

            const modify = new Modify({ source: vSource });
            map.addInteraction(modify);

            const updateLL = () => {
                const ll = toLonLat(markerFeature.getGeometry()!.getCoordinates());
                setLng(ll[0]);
                setLat(ll[1]);
            };

            modify.on("modifyend", updateLL);

            map.on("singleclick", (evt) => {
                markerFeature.setGeometry(new Point(evt.coordinate));
                updateLL();
            });

            const doResize = () => {
                try {
                    map.updateSize();
                } catch {}
            };
            requestAnimationFrame(doResize);
            setTimeout(doResize, 250);

            const ro = new ResizeObserver(doResize);
            ro.observe(host);
            resizeObsRef.current = ro;

            mapRef.current = map;
            markerFeatureRef.current = markerFeature;

            if (disposed) {
                ro.disconnect();
                map.setTarget(undefined as any);
            }
        })();

        return () => {
            disposed = true;
            try {
                resizeObsRef.current?.disconnect();
                mapRef.current?.setTarget(undefined as any);
            } catch {}
            resizeObsRef.current = null; // <-- corregido
            mapRef.current = null;
            markerFeatureRef.current = null;
        };
    }, [open, initialCenter[0], initialCenter[1]]);

    const reverseGeocode = async (lat: number, lon: number) => {
        try {
            const url = new URL("https://nominatim.openstreetmap.org/reverse");
            url.searchParams.set("lat", String(lat));
            url.searchParams.set("lon", String(lon));
            url.searchParams.set("format", "jsonv2");
            url.searchParams.set("accept-language", "es");
            const res = await fetch(url.toString());
            const data: any = await res.json();
            const addr = data?.address || {};
            return {
                country: addr.country,
                state: addr.state || addr.region,
                county: addr.county || addr.province,
                municipality: addr.municipality || addr.city || addr.town || addr.village || addr.suburb,
                localityLabel: data?.display_name,
            };
        } catch {
            return {};
        }
    };

    const handleConfirm = async () => {
        const details = await reverseGeocode(lat, lng);
        onConfirm({ lat, lon: lng, ...details });
        onOpenChange(false);
    };

    const handleLocateMe = async () => {
        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }
        setLoadingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                setLoadingLocation(false);
                const newLat = pos.coords.latitude;
                const newLon = pos.coords.longitude;
                setLat(newLat);
                setLng(newLon);

                const coord3857 = fromLonLat([newLon, newLat]);
                if (markerFeatureRef.current) {
                    markerFeatureRef.current.setGeometry(new Point(coord3857));
                }
                if (mapRef.current) {
                    mapRef.current.getView().setCenter(coord3857);
                    mapRef.current.getView().setZoom(15);
                }

                const details = await reverseGeocode(newLat, newLon);
                onConfirm({ lat: newLat, lon: newLon, ...details });
            },
            (err) => {
                setLoadingLocation(false);
                console.error(err);
                alert("No se pudo obtener la ubicación. Verifica permisos.");
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    if (!open) return null;

    return (
        <div className="mt-3 rounded-xl border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Selecciona una ubicación en el mapa
                </h3>
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                    Cerrar
                </Button>
            </div>

            <div className="relative mb-3">
                <div
                    ref={hostRef}
                    className="w-full rounded-lg overflow-hidden border bg-muted/20"
                    style={{ height: "480px" }}
                />
                <div className="pointer-events-none absolute left-4 bottom-4 bg-background/80 px-2 py-1 rounded text-xs shadow">
                    Lon: {lng.toFixed(6)} · Lat: {lat.toFixed(6)} — clic o arrastra el punto
                </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={handleLocateMe}
                    disabled={loadingLocation}
                    className="flex items-center gap-2"
                >
                    <Crosshair className="h-4 w-4" />
                    {loadingLocation ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
                </Button>

                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                        Usar esta ubicación
                    </Button>
                </div>
            </div>
        </div>
    );
}
