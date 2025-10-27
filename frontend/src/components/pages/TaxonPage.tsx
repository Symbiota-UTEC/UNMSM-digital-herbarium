import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Plus, Leaf, ChevronRight } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface Taxon {
  id: string;
  scientificName: string;
  commonName: string;
  rank: string;
  family: string;
  author: string;
  occurrencesCount: number;
}

export function TaxonPage() {
  const [taxa, setTaxa] = useState<Taxon[]>([
    {
      id: '1',
      scientificName: 'Heliconia bihai',
      commonName: 'Platanillo rojo',
      rank: 'Especie',
      family: 'Heliconiaceae',
      author: '(L.) L.',
      occurrencesCount: 5
    },
    {
      id: '2',
      scientificName: 'Ceiba pentandra',
      commonName: 'Ceiba',
      rank: 'Especie',
      family: 'Malvaceae',
      author: '(L.) Gaertn.',
      occurrencesCount: 3
    },
    {
      id: '3',
      scientificName: 'Gentiana sedifolia',
      commonName: 'Genciana andina',
      rank: 'Especie',
      family: 'Gentianaceae',
      author: 'Kunth',
      occurrencesCount: 7
    },
    {
      id: '4',
      scientificName: 'Puya raimondii',
      commonName: 'Puya de Raimondi',
      rank: 'Especie',
      family: 'Bromeliaceae',
      author: 'Harms',
      occurrencesCount: 2
    }
  ]);

  const [open, setOpen] = useState(false);
  const [newTaxon, setNewTaxon] = useState({
    scientificName: '',
    commonName: '',
    rank: '',
    family: '',
    author: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const taxon: Taxon = {
      id: Date.now().toString(),
      ...newTaxon,
      occurrencesCount: 0
    };
    setTaxa([taxon, ...taxa]);
    setNewTaxon({
      scientificName: '',
      commonName: '',
      rank: '',
      family: '',
      author: ''
    });
    setOpen(false);
    toast.success('Taxón registrado exitosamente');
  };

  const getRankColor = (rank: string) => {
    const colors: { [key: string]: string } = {
      'Especie': 'bg-red-50 text-primary',
      'Género': 'bg-blue-100 text-blue-800',
      'Familia': 'bg-purple-100 text-purple-800',
      'Orden': 'bg-orange-100 text-orange-800'
    };
    return colors[rank] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl mb-2">Taxones</h1>
          <p className="text-muted-foreground">
            Catálogo de clasificación taxonómica
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Taxón
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Nuevo Taxón</DialogTitle>
              <DialogDescription>
                Agrega un nuevo taxón al catálogo taxonómico
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scientificName">Nombre Científico</Label>
                <Input
                  id="scientificName"
                  value={newTaxon.scientificName}
                  onChange={(e) => setNewTaxon({...newTaxon, scientificName: e.target.value})}
                  placeholder="Genus species"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="commonName">Nombre Común</Label>
                <Input
                  id="commonName"
                  value={newTaxon.commonName}
                  onChange={(e) => setNewTaxon({...newTaxon, commonName: e.target.value})}
                  placeholder="Nombre vulgar"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rank">Rango Taxonómico</Label>
                  <Select
                    value={newTaxon.rank}
                    onValueChange={(value) => setNewTaxon({...newTaxon, rank: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el rango" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Especie">Especie</SelectItem>
                      <SelectItem value="Género">Género</SelectItem>
                      <SelectItem value="Familia">Familia</SelectItem>
                      <SelectItem value="Orden">Orden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="family">Familia</Label>
                  <Input
                    id="family"
                    value={newTaxon.family}
                    onChange={(e) => setNewTaxon({...newTaxon, family: e.target.value})}
                    placeholder="Familia"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="author">Autor</Label>
                <Input
                  id="author"
                  value={newTaxon.author}
                  onChange={(e) => setNewTaxon({...newTaxon, author: e.target.value})}
                  placeholder="L. / (L.) Gaertn."
                />
              </div>

              <Button type="submit" className="w-full">Registrar Taxón</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {taxa.map((taxon) => (
          <Card key={taxon.id} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <Leaf className="h-6 w-6 text-primary" />
                <Badge className={getRankColor(taxon.rank)}>
                  {taxon.rank}
                </Badge>
              </div>
              <CardTitle className="italic">{taxon.scientificName}</CardTitle>
              {taxon.author && (
                <p className="text-sm text-muted-foreground">{taxon.author}</p>
              )}
              <CardDescription>{taxon.commonName}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Familia:</span>
                  <span>{taxon.family}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ocurrencias:</span>
                  <Badge variant="secondary">{taxon.occurrencesCount}</Badge>
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-2">
                  Ver detalles
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}