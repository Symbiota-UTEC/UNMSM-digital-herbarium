import { useCallback, useEffect } from "react";
import { Routes, Route, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PublicNavbar } from "./components/PublicNavbar";
import { PrivateNavbar } from "./components/PrivateNavbar";
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

interface NavigationParams {
  collectionId?: string;
  collectionName?: string;
  collectionInstitutionId?: string;
  isOwner?: boolean;
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection";
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
        "$"
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
        },
      };
    case "taxon":
      return { path: "/taxon" };
    case "taxon-detail": {
      const taxonId = params.taxonId?.toString();
      if (!taxonId) return null;
      return {
        path: `/taxon/${taxonId}`,
        state: { taxonId },
      };
    }
    case "profile":
      return { path: "/profile" };
    case "admin":
      return { path: "/admin" };
    case "map":
      return { path: "/map" };
    default:
      return { path: "/" };
  }
};

function AppContent() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = useCallback(
    (page: string, params?: NavigationParams) => {
      const target = buildRoute(page, params);
      if (!target) {
        console.warn(`Missing navigation params for page "${page}"`, params);
        return;
      }
      navigate(target.path, { state: target.state, replace: target.replace });
    },
    [navigate]
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

  const CollectionDetailRoute = () => {
    const { collectionId = "" } = useParams();
    const state = (location.state as NavigationParams) || {};

    return (
      <CollectionDetailPage
        collectionId={collectionId}
        collectionName={state.collectionName || ""}
        collectionInstitutionId={state.collectionInstitutionId}
        isOwner={Boolean(state.isOwner)}
        onNavigate={handleNavigation}
      />
    );
  };

  const OccurrenceDetailRoute = () => {
    const { occurrenceId = "" } = useParams();
    const state = (location.state as NavigationParams) || {};
    const collectionId = state.collectionId ? state.collectionId.toString() : undefined;

    return (
      <OccurrenceDetailPage
        occurrenceId={occurrenceId}
        onNavigate={handleNavigation}
        returnTo={state.returnTo || (collectionId ? "collection" : "occurrences")}
        collectionId={collectionId}
        collectionName={state.collectionName}
        isOwner={state.isOwner}
      />
    );
  };

  const NewOccurrenceRoute = ({ mode }: { mode: "create" | "edit" }) => {
    const { occurrenceId } = useParams();
    const state = (location.state as NavigationParams) || {};
    const collectionId = state.collectionId ? state.collectionId.toString() : undefined;

    return (
      <NewOccurrencePage
        onNavigate={handleNavigation}
        mode={mode}
        occurrenceId={occurrenceId}
        returnTo={state.returnTo || (collectionId ? "collection" : "occurrences")}
        collectionId={collectionId}
        collectionName={state.collectionName}
        isOwner={state.isOwner}
      />
    );
  };

  const CSVImportRoute = () => {
    const { collectionId = "" } = useParams();
    const state = (location.state as NavigationParams) || {};

    return (
      <CSVImportPage
        collectionId={collectionId}
        collectionName={state.collectionName || ""}
        onNavigate={handleNavigation}
      />
    );
  };

  const TaxonDetailRoute = () => {
    const { taxonId = "" } = useParams();
    const state = (location.state as NavigationParams) || {};

    return (
      <TaxonDetailPage
        taxonId={taxonId || (state.taxonId?.toString() ?? "")}
        onNavigate={handleNavigation}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated ? (
        <PrivateNavbar onNavigate={handleNavigation} currentPage={currentPage} />
      ) : (
        <PublicNavbar onNavigate={handleNavigation} />
      )}

      <Routes>
        <Route path="/" element={<HomePage onNavigate={handleNavigation} />} />
        <Route path="/login" element={<LoginPage onNavigate={handleNavigation} />} />
        <Route path="/register" element={<RegisterPage onNavigate={handleNavigation} />} />
        <Route path="/collections" element={<CollectionsPage onNavigate={handleNavigation} />} />
        <Route path="/collections/:collectionId" element={<CollectionDetailRoute />} />
        <Route path="/collections/:collectionId/csv-import" element={<CSVImportRoute />} />
        <Route path="/occurrences" element={<OccurrencesPage onNavigate={handleNavigation} />} />
        <Route path="/occurrences/new" element={<NewOccurrenceRoute mode="create" />} />
        <Route path="/occurrences/:occurrenceId/edit" element={<NewOccurrenceRoute mode="edit" />} />
        <Route path="/occurrences/:occurrenceId" element={<OccurrenceDetailRoute />} />
        <Route path="/taxon" element={<TaxonPage onNavigate={handleNavigation} />} />
        <Route path="/taxon/:taxonId" element={<TaxonDetailRoute />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage onNavigate={handleNavigation} />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="*" element={<HomePage onNavigate={handleNavigation} />} />
      </Routes>

      <Toaster />
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
