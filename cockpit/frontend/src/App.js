import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EntreprisesPage from "./pages/EntreprisesPage";
import EntrepriseDetailPage from "./pages/EntrepriseDetailPage";
import SecteursPage from "./pages/SecteursPage";
import ContactsPage from "./pages/ContactsPage";
import OpportunitesPage from "./pages/OpportunitesPage";
import ObjectifsPage from "./pages/ObjectifsPage";
import TodosPage from "./pages/TodosPage";
import ImportPage from "./pages/ImportPage";
import ProfilPage from "./pages/ProfilPage";
import PlaceholderPage from "./pages/PlaceholderPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // Force password change on first login - allow /profil access only
  if (user.must_change_password && location.pathname !== "/profil") {
    return <Navigate to="/profil" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/entreprises" element={<ProtectedRoute><EntreprisesPage /></ProtectedRoute>} />
      <Route path="/entreprises/:id" element={<ProtectedRoute><EntrepriseDetailPage /></ProtectedRoute>} />
      <Route path="/secteurs" element={<ProtectedRoute><SecteursPage /></ProtectedRoute>} />
      <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><PlaceholderPage title="Pipeline" /></ProtectedRoute>} />
      <Route path="/opportunites" element={<ProtectedRoute><OpportunitesPage /></ProtectedRoute>} />
      <Route path="/objectifs" element={<ProtectedRoute><ObjectifsPage /></ProtectedRoute>} />
      <Route path="/todos" element={<ProtectedRoute><TodosPage /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
      <Route path="/templates" element={<ProtectedRoute><PlaceholderPage title="Templates" /></ProtectedRoute>} />
      <Route path="/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
