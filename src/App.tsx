import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ForegroundNotificationBanner } from "@/components/ForegroundNotificationBanner";
import { AIFocusHighlighter } from "@/components/ai/AIFocusHighlighter";
import { AIRouteFocusTracker } from "@/components/ai/AIRouteFocusTracker";
import { SpotlightLayer } from "@/components/ai/SpotlightLayer";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { RolePreviewProvider } from "@/hooks/useRolePreview";
import { LanguagePreferenceSync } from "@/hooks/useLanguagePreference";

import { PropertyProvider } from "@/hooks/useProperty";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleRedirect from "@/components/RoleRedirect";
import Index from "./pages/Index";
import EmbedWidget from "./pages/EmbedWidget";
import Auth from "./pages/Auth";
import GuestAuth from "./pages/GuestAuth";
import Units from "./pages/Units";
import Bookings from "./pages/Bookings";
import CalendarView from "./pages/CalendarView";
import Pricing from "./pages/Pricing";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import GuestPortal from "./pages/GuestPortal";
import GuestPortalPreview from "./pages/GuestPortalPreview";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import Embeds from "./pages/Embeds";
import Stay from "./pages/Stay";
import Simulation from "./pages/Simulation";
import FrontDesk from "./pages/FrontDesk";
import ArrivalsBoard from "./pages/ArrivalsBoard";
import AdminBookingFlow from "./pages/AdminBookingFlow";
import LandingPage from "./pages/LandingPage";
import DisasterRecovery from "./pages/DisasterRecovery";
import GuestPaymentLink from "./pages/GuestPaymentLink";
import PaymentReport from "./pages/PaymentReport";
import MediaLibrary from "./pages/MediaLibrary";
import SecurityCenter from "./pages/SecurityCenter";
import MonitoringCenter from "./pages/MonitoringCenter";
import ResetPassword from "./pages/ResetPassword";
import OpsControlTower from "./pages/OpsControlTower";
import OpsConsole from "./pages/OpsConsole";
import GuidanceLab from "./pages/GuidanceLab";
import OAuthConsent from "./pages/OAuthConsent";
import NotificationCenter from "./pages/NotificationCenter";
import AdjustmentsCenter from "./pages/AdjustmentsCenter";
import StripeSetup from "./pages/StripeSetup";
import Unsubscribe from "./pages/Unsubscribe";



// Global React Query defaults — consistent caching across all hooks.
// Per-hook overrides remain authoritative; this only sets the floor.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 1 min — kill the request-storm-on-mount pattern
      gcTime: 5 * 60_000,         // 5 min cache retention
      refetchOnWindowFocus: false, // never refetch just because the tab regained focus
                                   // (it wiped in-progress work / open dialogs)
      refetchOnReconnect: true,   // self-heal after network blips (iOS bfcache, etc.)
      retry: 1,
    },
    mutations: { retry: 0 },
  },
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <RolePreviewProvider>
          <PropertyProvider>
            <LanguagePreferenceSync />
            <Toaster />
            <Sonner />

            <BrowserRouter>
              <ForegroundNotificationBanner />
              <AIFocusHighlighter />
              <AIRouteFocusTracker />
              <SpotlightLayer />

              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/guest" element={<GuestAuth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

{/* Public landing page */}
                <Route path="/" element={<LandingPage />} />

                {/* Authenticated root redirects based on role */}
                <Route path="/index" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

                {/* Staff routes — each enforced by canAccessRoute */}
                <Route path="/dashboard" element={<ProtectedRoute requiredPath="/dashboard"><Index /></ProtectedRoute>} />
                <Route path="/units" element={<ProtectedRoute requiredPath="/units"><Units /></ProtectedRoute>} />
                <Route path="/media-library" element={<ProtectedRoute requiredPath="/media-library"><MediaLibrary /></ProtectedRoute>} />
                <Route path="/bookings" element={<ProtectedRoute requiredPath="/bookings"><Bookings /></ProtectedRoute>} />
                <Route path="/arrivals-board" element={<ProtectedRoute requiredPath="/arrivals-board"><ArrivalsBoard /></ProtectedRoute>} />
                <Route path="/admin-booking" element={<ProtectedRoute requiredPath="/admin-booking"><AdminBookingFlow /></ProtectedRoute>} />
                <Route path="/guest-preview" element={<ProtectedRoute requiredPath="/guest-preview"><GuestPortalPreview /></ProtectedRoute>} />
                <Route path="/front-desk" element={<ProtectedRoute requiredPath="/front-desk"><FrontDesk /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute requiredPath="/calendar"><CalendarView /></ProtectedRoute>} />
                <Route path="/pricing" element={<ProtectedRoute requiredPath="/pricing"><Pricing /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute requiredPath="/reports"><Reports /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requiredPath="/settings"><Settings /></ProtectedRoute>} />
                <Route path="/stripe-setup" element={<ProtectedRoute requiredPath="/settings"><StripeSetup /></ProtectedRoute>} />

                <Route path="/messages" element={<ProtectedRoute requiredPath="/messages"><Messages /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute requiredPath="/notifications"><NotificationCenter /></ProtectedRoute>} />
                <Route path="/adjustments" element={<ProtectedRoute requiredPath="/adjustments"><AdjustmentsCenter /></ProtectedRoute>} />
                <Route path="/embeds" element={<ProtectedRoute requiredPath="/embeds"><Embeds /></ProtectedRoute>} />
                <Route path="/simulation" element={<ProtectedRoute requiredPath="/simulation"><Simulation /></ProtectedRoute>} />
                <Route path="/disaster-recovery" element={<ProtectedRoute requiredPath="/disaster-recovery"><DisasterRecovery /></ProtectedRoute>} />
                <Route path="/security-center" element={<ProtectedRoute requiredPath="/security-center"><SecurityCenter /></ProtectedRoute>} />
                <Route path="/monitoring" element={<ProtectedRoute requiredPath="/monitoring"><MonitoringCenter /></ProtectedRoute>} />
                <Route path="/ops-console" element={<ProtectedRoute requiredPath="/ops-console"><OpsConsole /></ProtectedRoute>} />
                <Route path="/ops-control-tower" element={<ProtectedRoute requiredPath="/ops-control-tower"><OpsControlTower /></ProtectedRoute>} />
                <Route path="/guidance-lab" element={<ProtectedRoute><GuidanceLab /></ProtectedRoute>} />
                <Route path="/admin/payment-report" element={<ProtectedRoute><PaymentReport /></ProtectedRoute>} />


                {/* Guest portal */}
                <Route path="/guest" element={<ProtectedRoute guestOnly><GuestPortal /></ProtectedRoute>} />

                {/* Public pages — no auth required */}
                <Route path="/embed/:type/:unitId" element={<EmbedWidget />} />
                <Route path="/embed/:type" element={<EmbedWidget />} />
                <Route path="/stay" element={<Stay />} />
                <Route path="/pay/:token" element={<GuestPaymentLink />} />
                <Route path="/legal" element={<Legal />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />

                <Route path="/landing" element={<LandingPage />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </PropertyProvider>
          </RolePreviewProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
