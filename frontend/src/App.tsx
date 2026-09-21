import { useCallback, useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PublicNavbar } from "./components/PublicNavbar";
import { PrivateSidebar } from "./components/PrivateSidebar";
import { HomePage } from "./components/pages/HomePage";
import { LoginPage } from "./components/pages/LoginPage";
import { RegisterPage } from "./components/pages/RegisterPage";
import { CollectionsPage } from "./components/pages/CollectionsPage";
import { CollectionDetailPage } from "./components/pages/CollectionDetailPage";
import { OccurrencesPage } from "./components/pages/OccurrencesPage";
import { NewOccurrencePage } from "./components/pages/NewOccurrencePage";
import { OccurrenceDetailPage } from "./components/pages/OccurrenceDetailPage";
import { CSVImportPage } from "./components/pages/CSVImportPage";
import { TaxonPage } from "./components/pages/TaxonPage";
import { ProfilePage } from "./components/pages/ProfilePage";
import { AdminPage } from "./components/pages/AdminPage";
import { MapPage } from "./components/pages/MapPage";
import { Toaster } from "./components/ui/sonner";

import { TaxonDetailPage } from "./components/pages/TaxonDetailPage";
import { UploadsPage } from "./components/pages/UploadsPage";

interface NavigationParams {
  collectionId?: string;
  collectionName?: string;
  collectionInstitutionId?: string;
  isOwner?: boolean;
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection" | "taxon" | "map";
  // Origen del detalle de ocurrencia, para conservarlo si se pasa por el detalle de un taxón.
  originReturnTo?: string;
  returnOccurrenceId?: string;
  // Al volver al mapa, restaurar la última búsqueda.
  restoreSearch?: boolean;
  taxonId?: string;
}

interface RouteConfig {
  path: string;
  pageId: string;
}

const routeConfigs: RouteConfig[] = [
  { path: "/", pageId: "home" },
  { path: "/login", pageId: "login" },
  { path: "/register", pageId: "register" },
  { path: "/collections", pageId: "collections" },
  { path: "/collections/:collectionId", pageId: "collection-detail" },
  { path: "/collections/:collectionId/csv-import", pageId: "csv-import" },
  { path: "/occurrences", pageId: "occurrences" },
  { path: "/occurrences/new", pageId: "new-occurrence" },
  { path: "/occurrences/:occurrenceId/edit", pageId: "edit-occurrence" },
  { path: "/occurrences/:occurrenceId", pageId: "occurrence-detail" },
  { path: "/uploads", pageId: "uploads" },
  { path: "/taxon", pageId: "taxon" },
  { path: "/taxon/:taxonId", pageId: "taxon-detail" },
  { path: "/profile", pageId: "profile" },
  { path: "/admin", pageId: "admin" },
  { path: "/map", pageId: "map" },
];

const resolveCurrentPage = (pathname: string) => {
  for (const config of routeConfigs) {
    const pattern = new RegExp(
      "^" +
        config.path
          .replace(/\//g, "\\/")
          .replace(/:\w+\?/g, "(?:[^/]+)?")
          .replace(/:\w+/g, "[^/]+") +
        "$",
    );
    if (pattern.test(pathname)) {
      return config.pageId;
    }
  }
  return "home";
};

const buildRoute = (page: string, params: NavigationParams = {}) => {
  switch (page) {
    case "home":
      return { path: "/" };
    case "login":
      return { path: "/login" };
    case "register":
      return { path: "/register" };
    case "collections":
      return { path: "/collections" };
    case "collection-detail": {
      const collectionId = params.collectionId?.toString();
      if (!collectionId) return null;
      return {
        path: `/collections/${collectionId}`,
        state: {
          collectionId,
          collectionName: params.collectionName,
          collectionInstitutionId: params.collectionInstitutionId,
          isOwner: params.isOwner,
        },
      };
    }
    case "csv-import": {
      const collectionId = params.collectionId?.toString();
      if (!collectionId) return null;
      return {
        path: `/collections/${collectionId}/csv-import`,
        state: {
          collectionId,
          collectionName: params.collectionName,
          isOwner: params.isOwner,
        },
      };
    }
    case "occurrences":
      return { path: "/occurrences" };
    case "new-occurrence":
      return {
        path: "/occurrences/new",
        state: {
          collectionId: params.collectionId?.toString(),
          collectionName: params.collectionName,
          isOwner: params.isOwner,
        },
      };
    case "edit-occurrence":
      if (!params.occurrenceId) return null;
      return {
        path: `/occurrences/${params.occurrenceId}/edit`,
        state: {
          returnTo: params.returnTo ?? (params.collectionId ? "collection" : "occurrences"),
          collectionId: params.collectionId?.toString(),
          collectionName: params.collectionName,
          isOwner: params.isOwner,
        },
      };
    case "occurrence-detail":
      if (!params.occurrenceId) return null;
      return {
        path: `/occurrences/${params.occurrenceId}`,
        state: {
          returnTo: params.returnTo ?? (params.collectionId ? "collection" : "occurrences"),
          collectionId: params.collectionId?.toString(),
          collectionName: params.collectionName,
          isOwner: params.isOwner,
          taxonId: params.taxonId?.toString(),
        },
      };
    case "uploads":
      return { path: "/uploads" };
    case "taxon":
      return { path: "/taxon" };
    case "taxon-detail": {
      const taxonId = params.taxonId?.toString();
      if (!taxonId) return null;
      return {
        path: `/taxon/${taxonId}`,
        state: {
          taxonId,
          returnTo: params.returnTo,
          originReturnTo: params.originReturnTo,
          returnOccurrenceId: params.returnOccurrenceId?.toString(),
          collectionId: params.collectionId?.toString(),
          collectionName: params.collectionName,
          isOwner: params.isOwner,
        },
      };
    }
    case "profile":
      return { path: "/profile" };
    case "admin":
      return { path: "/admin" };
    case "map":
      return { path: "/map", state: params.restoreSearch ? { restoreSearch: true } : undefined };
    default:
      return { path: "/" };
  }
};

// Rutas con parámetros. Van a nivel de módulo: si se definieran dentro de AppContent, React las
// vería como un componente nuevo en cada render y remontaría la página (refetch + parpadeo).
type NavigateFn = (page: string, params?: NavigationParams) => void;

const useRouteState = () => (useLocation().state as NavigationParams) || {};

const CollectionDetailRoute = ({ onNavigate }: { onNavigate: NavigateFn }) => {
  const { collectionId = "" } = useParams();
  const state = useRouteState();

  return (
    <CollectionDetailPage
      collectionId={collectionId}
      collectionName={state.collectionName || ""}
      collectionInstitutionId={state.collectionInstitutionId}
      isOwner={Boolean(state.isOwner)}
      onNavigate={onNavigate}
    />
  );
};

const OccurrenceDetailRoute = ({ onNavigate }: { onNavigate: NavigateFn }) => {
  const { occurrenceId = "" } = useParams();
  const state = useRouteState();
  const collectionId = state.collectionId ? state.collectionId.toString() : undefined;

  return (
    <OccurrenceDetailPage
      occurrenceId={occurrenceId}
      onNavigate={onNavigate}
      returnTo={state.returnTo || (collectionId ? "collection" : "occurrences")}
      collectionId={collectionId}
      collectionName={state.collectionName}
      isOwner={state.isOwner}
      taxonId={state.taxonId?.toString()}
    />
  );
};

const NewOccurrenceRoute = ({ mode, onNavigate }: { mode: "create" | "edit"; onNavigate: NavigateFn }) => {
  const { occurrenceId } = useParams();
  const state = useRouteState();
  const collectionId = state.collectionId ? state.collectionId.toString() : undefined;

  return (
    <NewOccurrencePage
      onNavigate={onNavigate}
      mode={mode}
      occurrenceId={occurrenceId}
      returnTo={state.returnTo || (collectionId ? "collection" : "occurrences")}
      collectionId={collectionId}
      collectionName={state.collectionName}
      isOwner={state.isOwner}
      taxonId={state.taxonId?.toString()}
    />
  );
};

const CSVImportRoute = ({ onNavigate }: { onNavigate: NavigateFn }) => {
  const { collectionId = "" } = useParams();
  const state = useRouteState();

  return (
    <CSVImportPage collectionId={collectionId} collectionName={state.collectionName || ""} onNavigate={onNavigate} />
  );
};

const TaxonDetailRoute = ({ onNavigate }: { onNavigate: NavigateFn }) => {
  const { taxonId = "" } = useParams();
  const state = useRouteState();

  return (
    <TaxonDetailPage
      taxonId={taxonId || (state.taxonId?.toString() ?? "")}
      returnTo={state.returnTo?.toString()}
      originReturnTo={state.originReturnTo?.toString()}
      returnOccurrenceId={state.returnOccurrenceId?.toString()}
      collectionId={state.collectionId?.toString()}
      collectionName={state.collectionName?.toString()}
      isOwner={state.isOwner as boolean | undefined}
      onNavigate={onNavigate}
    />
  );
};

// Pages whose search params should be saved and restored on re-visit
const FILTER_PAGES = ["/occurrences", "/taxon", "/collections"];

function AppContent() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Persists the last search string for each filter page across navigation
  const lastSearch = useRef<Record<string, string>>({});

  useEffect(() => {
    const path = location.pathname;
    if (FILTER_PAGES.includes(path)) {
      if (location.search) {
        lastSearch.current[path] = location.search;
      } else {
        delete lastSearch.current[path];
      }
    }
  }, [location.pathname, location.search]);

  const handleNavigation = useCallback(
    (page: string, params?: NavigationParams) => {
      const target = buildRoute(page, params);
      if (!target) {
        console.warn(`Missing navigation params for page "${page}"`, params);
        return;
      }
      // Restore last search params when navigating to a filter page with no specific params
      const savedSearch = !params && FILTER_PAGES.includes(target.path) ? (lastSearch.current[target.path] ?? "") : "";
      navigate(
        { pathname: target.path, search: savedSearch },
        { state: target.state, replace: (target as any).replace },
      );
    },
    [navigate],
  );

  useEffect(() => {
    const redirectToLogin = () => handleNavigation("login");
    window.addEventListener("auth:logged-out", redirectToLogin);
    return () => window.removeEventListener("auth:logged-out", redirectToLogin);
  }, [handleNavigation]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (["/", "/login", "/register"].includes(location.pathname)) {
      handleNavigation("collections");
    }
  }, [isAuthenticated, location.pathname, handleNavigation]);

  const currentPage = resolveCurrentPage(location.pathname);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {isAuthenticated && <PrivateSidebar onNavigate={handleNavigation} currentPage={currentPage} />}

      <main
        className="flex flex-col flex-1 min-w-0 overflow-y-auto"
        style={{ paddingLeft: "1.5rem", paddingRight: "1.5rem" }}
      >
        {!isAuthenticated && <PublicNavbar onNavigate={handleNavigation} />}

        <Routes>
          <Route path="/" element={<HomePage onNavigate={handleNavigation} />} />
          <Route path="/login" element={<LoginPage onNavigate={handleNavigation} />} />
          <Route path="/register" element={<RegisterPage onNavigate={handleNavigation} />} />
          <Route path="/collections" element={<CollectionsPage onNavigate={handleNavigation} />} />
          <Route path="/collections/:collectionId" element={<CollectionDetailRoute onNavigate={handleNavigation} />} />
          <Route
            path="/collections/:collectionId/csv-import"
            element={<CSVImportRoute onNavigate={handleNavigation} />}
          />
          <Route path="/occurrences" element={<OccurrencesPage onNavigate={handleNavigation} />} />
          <Route path="/occurrences/new" element={<NewOccurrenceRoute mode="create" onNavigate={handleNavigation} />} />
          <Route
            path="/occurrences/:occurrenceId/edit"
            element={<NewOccurrenceRoute mode="edit" onNavigate={handleNavigation} />}
          />
          <Route path="/occurrences/:occurrenceId" element={<OccurrenceDetailRoute onNavigate={handleNavigation} />} />
          <Route path="/uploads" element={<UploadsPage />} />
          <Route path="/taxon" element={<TaxonPage onNavigate={handleNavigation} />} />
          <Route path="/taxon/:taxonId" element={<TaxonDetailRoute onNavigate={handleNavigation} />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage onNavigate={handleNavigation} />} />
          <Route path="/map" element={<MapPage onNavigate={handleNavigation} />} />
          <Route path="*" element={<HomePage onNavigate={handleNavigation} />} />
        </Routes>

        <Toaster position="top-right" />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
