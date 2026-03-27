import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-destructive text-destructive-foreground text-center text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
      <WifiOff className="h-3.5 w-3.5" />
      You're offline — showing cached data
    </div>
  );
}
