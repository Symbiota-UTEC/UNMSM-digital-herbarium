import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

// Estilos de la ubicación de una ocurrencia, compartidos por el formulario y el detalle.
export const markerStyle = new Style({
    image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "#b91c1c" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
});

export const polygonStyle = new Style({
    fill: new Fill({ color: "rgba(185, 28, 28, 0.15)" }),
    stroke: new Stroke({ color: "#b91c1c", width: 2 }),
});

export const uncertaintyStyle = new Style({
    fill: new Fill({ color: "rgba(185, 28, 28, 0.08)" }),
    stroke: new Stroke({ color: "#b91c1c", width: 2, lineDash: [6, 4] }),
});
