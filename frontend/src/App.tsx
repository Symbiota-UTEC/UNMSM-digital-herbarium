import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PublicNavbar } from './components/PublicNavbar';
import { PrivateNavbar } from './components/PrivateNavbar';
import { HomePage } from './components/pages/HomePage';
import { LoginPage } from './components/pages/LoginPage';
import { RegisterPage } from './components/pages/RegisterPage';
import { CollectionsPage } from './components/pages/CollectionsPage';
import { OccurrencesPage } from './components/pages/OccurrencesPage';
import { TaxonPage } from './components/pages/TaxonPage';
import { ProfilePage } from './components/pages/ProfilePage';
import { AdminPage } from './components/pages/AdminPage';
import { MapPage } from './components/pages/MapPage';
import { Toaster } from './components/ui/sonner';

function AppContent() {
  const [currentPage, setCurrentPage] = useState('home');
  const { isAuthenticated } = useAuth();

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={setCurrentPage} />;
      case 'login':
        return <LoginPage onNavigate={setCurrentPage} />;
      case 'register':
        return <RegisterPage onNavigate={setCurrentPage} />;
      case 'collections':
        return <CollectionsPage />;
      case 'occurrences':
        return <OccurrencesPage />;
      case 'taxon':
        return <TaxonPage />;
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return <AdminPage />;
      case 'map':
        return <MapPage />;
      default:
        return <HomePage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated ? (
        <PrivateNavbar onNavigate={setCurrentPage} currentPage={currentPage} />
      ) : (
        <PublicNavbar onNavigate={setCurrentPage} />
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