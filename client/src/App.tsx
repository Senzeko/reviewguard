import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AuthNavigationRegistrar } from './components/AuthNavigationRegistrar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PodSignalLayout } from './components/PodSignalLayout';
import { HomeRedirect } from './components/HomeRedirect';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Billing } from './pages/Billing';
import { NotFound } from './pages/NotFound';
import { ShowsPage } from './pages/ShowsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EpisodesListPage } from './pages/EpisodesListPage';
import { LaunchCampaignsPage } from './pages/LaunchCampaignsPage';
import { ShowDetailPage } from './pages/ShowDetailPage';
import { EpisodeDetailPage } from './pages/EpisodeDetailPage';
import { EpisodeLaunchPage } from './pages/EpisodeLaunchPage';
import { Onboarding } from './pages/Onboarding';
import { PodSignalAnalytics } from './pages/PodSignalAnalytics';
import { SponsorReportsPlaceholder } from './pages/SponsorReportsPlaceholder';
import { Settings } from './pages/Settings';
import { ReviewerConsole } from './pages/ReviewerConsole';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthNavigationRegistrar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/console/:investigationId" element={<ReviewerConsole />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<PodSignalLayout />}>
              <Route index element={<DashboardPage />} />
            </Route>
            <Route path="/shows" element={<PodSignalLayout />}>
              <Route index element={<ShowsPage />} />
              <Route path=":podcastId" element={<ShowDetailPage />} />
            </Route>
            <Route path="/episodes" element={<PodSignalLayout />}>
              <Route index element={<EpisodesListPage />} />
              <Route path=":episodeId" element={<EpisodeDetailPage />} />
              <Route path=":episodeId/launch" element={<EpisodeLaunchPage />} />
            </Route>
            <Route path="/campaigns" element={<PodSignalLayout />}>
              <Route index element={<LaunchCampaignsPage />} />
            </Route>
            <Route path="/billing" element={<PodSignalLayout />}>
              <Route index element={<Billing />} />
            </Route>
            <Route path="/analytics" element={<PodSignalLayout />}>
              <Route index element={<PodSignalAnalytics />} />
            </Route>
            <Route path="/reports" element={<PodSignalLayout />}>
              <Route index element={<SponsorReportsPlaceholder />} />
            </Route>
            <Route path="/settings" element={<PodSignalLayout />}>
              <Route index element={<Settings />} />
            </Route>
          </Route>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
