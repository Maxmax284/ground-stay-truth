import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Units from "./pages/Units";
import Bookings from "./pages/Bookings";
import CalendarView from "./pages/CalendarView";
import Pricing from "./pages/Pricing";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
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
            <Route path="/" element={<ProtectedRoute requireAdmin><Index /></ProtectedRoute>} />
            <Route path="/units" element={<ProtectedRoute requireAdmin><Units /></ProtectedRoute>} />
            <Route path="/bookings" element={<ProtectedRoute requireAdmin><Bookings /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute requireAdmin><CalendarView /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute requireAdmin><Pricing /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute requireAdmin><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
