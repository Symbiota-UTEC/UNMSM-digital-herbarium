import { useState } from "react";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import { defaults as defaultControls } from "ol/control/defaults";
import { defaults as defaultInteractions } from "ol/interaction/defaults";
import MouseWheelZoom from "ol/interaction/MouseWheelZoom";

import "ol/ol.css";
import "./map.css";

export type BasemapId = "satellite" | "topo" | "streets";

export const BASEMAPS: { id: BasemapId; label: string }[] = [
  { id: "satellite", label: "Satélite" },
  { id: "topo", label: "Topográfico" },
  { id: "streets", label: "Calles" },
];

export function createBasemapSource(id: BasemapId): XYZ {
  switch (id) {
    case "satellite":
      return new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attributions: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maxZoom: 18,
      });
    case "topo":
      return new XYZ({
        url: "https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attributions:
          'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, SRTM | Map style © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
        maxZoom: 17,
      });
    default:
      return new OSM();
  }
}

const STORAGE_KEY = "herbarium.basemap";

const readStoredBasemap = (): BasemapId => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (BASEMAPS.some((b) => b.id === stored)) return stored as BasemapId;
  } catch {
    // localStorage no disponible
  }
  return "satellite";
};

/** Mapa base elegido; se recuerda entre visitas y entre los dos mapas de la app. */
export function useBasemap() {
  const [basemap, setBasemapState] = useState<BasemapId>(readStoredBasemap);
  const setBasemap = (id: BasemapId) => {
    setBasemapState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // no crítico
    }
  };
  return [basemap, setBasemap] as const;
}

/** Botones +/- y atribución (obligatoria para Esri y OpenTopoMap); sin control de rotación. */
export const createMapControls = () =>
  defaultControls({
    rotate: false,
    zoomOptions: { duration: 150 },
    attributionOptions: { collapsible: true, collapsed: false },
  });

/** La rueda salta un nivel completo por giro (por defecto acercaba un tercio); sin rotación del mapa. */
export const createMapInteractions = () =>
  defaultInteractions({ altShiftDragRotate: false, pinchRotate: false, mouseWheelZoom: false }).extend([
    new MouseWheelZoom({ constrainResolution: true, duration: 150, timeout: 40 }),
  ]);

export const MAP_MIN_ZOOM = 2;
export const MAP_MAX_ZOOM = 19;
