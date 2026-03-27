import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PodSignalLayout } from './components/PodSignalLayout';
import { HomeRedirect } from './components/HomeRedirect';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { ReviewerConsole } from './pages/ReviewerConsole';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { Admin } from './pages/Admin';
import { Locations } from './pages/Locations';
import { Billing } from './pages/Billing';
import { NotFound } from './pages/NotFound';
import { ShowsPage } from './pages/ShowsPage';
import { ShowDetailPage } from './pages/ShowDetailPage';
import { EpisodeDetailPage } from './pages/EpisodeDetailPage';
import { EpisodeLaunchPage } from './pages/EpisodeLaunchPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Console is public — access controlled by unguessable investigation UUID */}
          <Route path="/console/:investigationId" element={<ReviewerConsole />} />
          <Route element={<ProtectedRoute />}>
            {/* PodSignal */}
            <Route path="/shows" element={<PodSignalLayout />}>
              <Route index element={<ShowsPage />} />
              <Route path=":podcastId" element={<ShowDetailPage />} />
            </Route>
            <Route path="/episodes/:episodeId" element={<PodSignalLayout />}>
              <Route index element={<EpisodeDetailPage />} />
              <Route path="launch" element={<EpisodeLaunchPage />} />
            </Route>
            <Route path="/dashboard" element={<PodSignalLayout />}>
              <Route index element={<Dashboard />} />
            </Route>
            <Route path="/analytics" element={<PodSignalLayout />}>
              <Route index element={<Analytics />} />
            </Route>
            <Route path="/billing" element={<PodSignalLayout />}>
              <Route index element={<Billing />} />
            </Route>
            {/* Legacy ReviewGuard (routes still registered server-side when LEGACY_REVIEWGUARD=true) */}
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/locations" element={<Locations />} />
          </Route>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
