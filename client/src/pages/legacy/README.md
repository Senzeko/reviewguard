# Legacy / unmounted pages

These files exist in `client/src/pages/` but are **not** imported in `App.tsx` for the shipped PodSignal product.

They target ReviewGuard console flows (investigations, disputes, legacy analytics) or experimental UIs.

**Do not** use them as the source of truth for PodSignal MVP navigation or copy.

Mounted PodSignal surfaces: `DashboardPage`, `ShowsPage`, `ShowDetailPage`, `EpisodesListPage`, `EpisodeDetailPage`, `LaunchCampaignsPage`, `EpisodeLaunchPage`, `Onboarding`, `Billing`, `PodSignalAnalytics`, `SponsorReportsPlaceholder`, `Settings`, auth pages.

Examples of legacy/unmounted modules: `Dashboard.tsx`, `Analytics.tsx`, `Admin.tsx`, `ReviewerConsole.tsx`, `Locations.tsx`, …
