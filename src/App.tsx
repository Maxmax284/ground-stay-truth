import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleRedirect from "@/components/RoleRedirect";
import Index from "./pages/Index";
import EmbedWidget from "./pages/EmbedWidget";
import Auth from "./pages/Auth";
import Units from "./pages/Units";
import Bookings from "./pages/Bookings";
import CalendarView from "./pages/CalendarView";
import Pricing from "./pages/Pricing";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import GuestPortal from "./pages/GuestPortal";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />

            {/* Root redirects based on role */}
            <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

            {/* Staff routes — each enforced by canAccessRoute */}
            <Route path="/dashboard" element={<ProtectedRoute requiredPath="/dashboard"><Index /></ProtectedRoute>} />
            <Route path="/units" element={<ProtectedRoute requiredPath="/units"><Units /></ProtectedRoute>} />
            <Route path="/bookings" element={<ProtectedRoute requiredPath="/bookings"><Bookings /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute requiredPath="/calendar"><CalendarView /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute requiredPath="/pricing"><Pricing /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute requiredPath="/reports"><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute requiredPath="/settings"><Settings /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute requiredPath="/messages"><Messages /></ProtectedRoute>} />

            {/* Guest portal */}
            <Route path="/guest" element={<ProtectedRoute guestOnly><GuestPortal /></ProtectedRoute>} />

            {/* Public embed widgets — no auth required */}
            <Route path="/embed/:type/:unitId" element={<EmbedWidget />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
