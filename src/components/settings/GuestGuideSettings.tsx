import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plane, BedDouble, MapPin } from "lucide-react";
import { ArrivalWelcomeEditor } from "@/components/ArrivalWelcomeEditor";
import { StayEssentialsEditor } from "@/components/StayEssentialsEditor";
import { WelcomeSheetEditor } from "@/components/settings/WelcomeSheetEditor";
import { LocalRecommendationsEditor } from "@/components/admin/LocalRecommendationsEditor";
import ErrorBoundary from "@/components/ErrorBoundary";

/**
 * One desk for everything guests read about their stay. Each sub-tab mounts the
 * existing editor, which saves to its existing table — no new data silos.
 */
export function GuestGuideSettings({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Guest Guide &amp; Welcome</h2>
        <p className="text-sm text-muted-foreground">
          Everything guests see in the portal's "Stay Guide &amp; Support" tab. Edit here, guests see it straight away.
        </p>
      </div>
      <Tabs defaultValue="essentials" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          {isAdmin && <TabsTrigger value="getting-here"><Plane className="h-3.5 w-3.5 mr-1" />Getting Here</TabsTrigger>}
          <TabsTrigger value="essentials"><BedDouble className="h-3.5 w-3.5 mr-1" />Camp &amp; Room Essentials</TabsTrigger>
          <TabsTrigger value="island"><MapPin className="h-3.5 w-3.5 mr-1" />Island Guide</TabsTrigger>
        </TabsList>
        {isAdmin && (
          <TabsContent value="getting-here">
            <ErrorBoundary inline label="Getting here"><ArrivalWelcomeEditor /></ErrorBoundary>
          </TabsContent>
        )}
        <TabsContent value="essentials" className="space-y-6">
          <ErrorBoundary inline label="Welcome sheet"><WelcomeSheetEditor /></ErrorBoundary>
          <ErrorBoundary inline label="Stay essentials"><StayEssentialsEditor /></ErrorBoundary>
        </TabsContent>
        <TabsContent value="island">
          <ErrorBoundary inline label="Island guide"><LocalRecommendationsEditor /></ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
