import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PublicNavbar } from './components/PublicNavbar';
import { PrivateNavbar } from './components/PrivateNavbar';
import { HomePage } from './components/pages/HomePage';
import { LoginPage } from './components/pages/LoginPage';
import { RegisterPage } from './components/pages/RegisterPage';
import { CollectionsPage } from './components/pages/CollectionsPage';
import { CollectionDetailPage } from './components/pages/CollectionDetailPage';
import { OccurrencesPage } from './components/pages/OccurrencesPage';
import { NewOccurrencePage } from './components/pages/NewOccurrencePage';
import { OccurrenceDetailPage } from './components/pages/OccurrenceDetailPage';
import { TaxonPage } from './components/pages/TaxonPage';
import { ProfilePage } from './components/pages/ProfilePage';
import { AdminPage } from './components/pages/AdminPage';
import { MapPage } from './components/pages/MapPage';
import { CSVImportPage } from "./components/pages/CSVImportPage";
import { Toaster } from './components/ui/sonner';

interface NavigationParams {
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
  occurrenceId?: string;
}

function AppContent() {
  const [currentPage, setCurrentPage] = useState('home');
  const [navParams, setNavParams] = useState<NavigationParams>({});
  const { isAuthenticated } = useAuth();

  // Si está autenticado, va a "collections"
  useEffect(() => {
    if (isAuthenticated) setCurrentPage('collections');
  }, [isAuthenticated]);

  // Si se cierra la sesion, va a "login"
  useEffect(() => {
    const toLogin = () => setCurrentPage('login');
    window.addEventListener('auth:logged-out', toLogin);
    return () => window.removeEventListener('auth:logged-out', toLogin);
  }, []);

  const handleNavigation = (page: string, params?: NavigationParams) => {
    setCurrentPage(page);
    if (params) setNavParams(params);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigation} />;
      case 'login':
        return <LoginPage onNavigate={handleNavigation} />;
      case 'register':
        return <RegisterPage onNavigate={handleNavigation} />;
      case 'collections':
        return <CollectionsPage onNavigate={handleNavigation} />;
      case 'collection.ts-detail':
        return (
            <CollectionDetailPage
                collectionId={navParams.collectionId || ''}
                collectionName={navParams.collectionName || ''}
                isOwner={navParams.isOwner || false}
                onNavigate={handleNavigation}
            />
        );
      case 'occurrences':
        return <OccurrencesPage onNavigate={handleNavigation} />;
      case 'new-occurrence':
        return <NewOccurrencePage onNavigate={handleNavigation} mode="create" />;
      case 'edit-occurrence':
        return (
            <NewOccurrencePage
                onNavigate={handleNavigation}
                mode="edit"
                occurrenceId={navParams.occurrenceId}
                returnTo="collection"
                collectionId={navParams.collectionId}
                collectionName={navParams.collectionName}
                isOwner={navParams.isOwner}
            />
        );
      case 'occurrence-detail':
        return (
            <OccurrenceDetailPage
                occurrenceId={navParams.occurrenceId || ''}
                onNavigate={handleNavigation}
                returnTo={navParams.collectionId ? 'collection' : 'occurrences'}
                collectionId={navParams.collectionId}
                collectionName={navParams.collectionName}
                isOwner={navParams.isOwner}
            />
        );
      case 'taxon':
        return <TaxonPage />;
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return <AdminPage onNavigate={handleNavigation} />;
      case 'map':
        return <MapPage />;
      case 'csv-import':
        return (
            <CSVImportPage
                collectionId={navParams.collectionId || ''}
                collectionName={navParams.collectionName || ''}
                onNavigate={handleNavigation}
            />
        );
      default:
        return <HomePage onNavigate={handleNavigation} />;
    }
  };

  return (
      <div className="min-h-screen bg-gray-50">
        {isAuthenticated ? (
            <PrivateNavbar onNavigate={handleNavigation} currentPage={currentPage} />
        ) : (
            <PublicNavbar onNavigate={handleNavigation} />
        )}
        {renderPage()}
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