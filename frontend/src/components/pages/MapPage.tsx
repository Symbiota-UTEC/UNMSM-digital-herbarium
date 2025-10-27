import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { MapPin, Search, X } from "lucide-react";

// Mock data for markers
const mockOccurrences = [
  { id: '1', scientificName: 'Heliconia bihai', taxon: 'Heliconiaceae', collection: 'Flora Amazónica 2024', country: 'Brasil', lat: -0.5234, lng: -64.7823, location: 'Río Negro, Amazonas' },
  { id: '2', scientificName: 'Ceiba pentandra', taxon: 'Malvaceae', collection: 'Flora Amazónica 2024', country: 'Brasil', lat: -3.1190, lng: -60.0217, location: 'Selva de Manaos' },
  { id: '3', scientificName: 'Gentiana sedifolia', taxon: 'Gentianaceae', collection: 'Herbáceas Andinas', country: 'Perú', lat: -13.2987, lng: -72.1345, location: 'Valle Sagrado, Cusco' },
  { id: '4', scientificName: 'Puya raimondii', taxon: 'Bromeliaceae', collection: 'Herbáceas Andinas', country: 'Perú', lat: -10.4234, lng: -76.5678, location: 'Cordillera Blanca' },
  { id: '5', scientificName: 'Cinchona officinalis', taxon: 'Rubiaceae', collection: 'Plantas Medicinales Locales', country: 'Colombia', lat: 4.5709, lng: -74.2973, location: 'Bogotá' },
];

export function MapPage() {
  const [filters, setFilters] = useState({
    taxon: '',
    scientificName: '',
    country: '',
    collection: ''
  });

  const [filteredOccurrences, setFilteredOccurrences] = useState(mockOccurrences);
  const mapRef = useRef<any>(null);
  const [map, setMap] = useState<any>(null);
  const markersRef = useRef<any[]>([]);

  // Initialize map
  useEffect(() => {
    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      initMap();
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
      if (map) {
        map.remove();
      }
    };
  }, []);

  const initMap = () => {
    if (mapRef.current && (window as any).L && !map) {
      const L = (window as any).L;
      const newMap = L.map(mapRef.current).setView([-8.7832, -63.0235], 4);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(newMap);

      setMap(newMap);
    }
  };

  // Update markers when filtered occurrences change
  useEffect(() => {
    if (map && (window as any).L) {
      const L = (window as any).L;
      
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Add new markers
      filteredOccurrences.forEach(occurrence => {
        const marker = L.marker([occurrence.lat, occurrence.lng])
          .addTo(map)
          .bindPopup(`
            <div style="min-width: 200px;">
              <strong style="font-style: italic;">${occurrence.scientificName}</strong><br/>
              <strong>Taxon:</strong> ${occurrence.taxon}<br/>
              <strong>Colección:</strong> ${occurrence.collection}<br/>
              <strong>Ubicación:</strong> ${occurrence.location}<br/>
              <strong>País:</strong> ${occurrence.country}
            </div>
          `);
        markersRef.current.push(marker);
      });

      // Adjust map bounds to show all markers
      if (filteredOccurrences.length > 0) {
        const bounds = L.latLngBounds(
          filteredOccurrences.map(o => [o.lat, o.lng])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [map, filteredOccurrences]);

  const handleSearch = () => {
    const filtered = mockOccurrences.filter(occurrence => {
      const matchesTaxon = !filters.taxon || occurrence.taxon.toLowerCase().includes(filters.taxon.toLowerCase());
      const matchesScientificName = !filters.scientificName || occurrence.scientificName.toLowerCase().includes(filters.scientificName.toLowerCase());
      const matchesCountry = !filters.country || filters.country === 'all' || occurrence.country.toLowerCase().includes(filters.country.toLowerCase());
      const matchesCollection = !filters.collection || filters.collection === 'all' || occurrence.collection === filters.collection;
      
      return matchesTaxon && matchesScientificName && matchesCountry && matchesCollection;
    });
    
    setFilteredOccurrences(filtered);
  };

  const handleClearFilters = () => {
    setFilters({
      taxon: '',
      scientificName: '',
      country: '',
      collection: ''
    });
    setFilteredOccurrences(mockOccurrences);
  };

  const uniqueCollections = [...new Set(mockOccurrences.map(o => o.collection))];
  const uniqueCountries = [...new Set(mockOccurrences.map(o => o.country))];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl mb-2">Mapa de Ocurrencias</h1>
        <p className="text-muted-foreground">
          Visualiza y filtra la distribución geográfica de especímenes
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
              <CardDescription>
                Refina la visualización del mapa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="taxon">Taxon</Label>
                <Input
                  id="taxon"
                  placeholder="Ej: Heliconiaceae"
                  value={filters.taxon}
                  onChange={(e) => setFilters({...filters, taxon: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scientificName">Nombre Científico</Label>
                <Input
                  id="scientificName"
                  placeholder="Ej: Heliconia bihai"
                  value={filters.scientificName}
                  onChange={(e) => setFilters({...filters, scientificName: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">País</Label>
                <Select
                  value={filters.country}
                  onValueChange={(value) => setFilters({...filters, country: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar país" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los países</SelectItem>
                    {uniqueCountries.map(country => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="collection">Colección</Label>
                <Select
                  value={filters.collection}
                  onValueChange={(value) => setFilters({...filters, collection: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar colección" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {uniqueCollections.map(collection => (
                      <SelectItem key={collection} value={collection}>{collection}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSearch} className="flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </Button>
                <Button onClick={handleClearFilters} variant="outline">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{filteredOccurrences.length} especímenes</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Distribución Geográfica</CardTitle>
              <CardDescription>
                Haz clic en los marcadores para ver detalles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                ref={mapRef} 
                style={{ height: '600px', width: '100%', borderRadius: '0.5rem' }}
                className="border"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}