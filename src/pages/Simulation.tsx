import { Link } from "react-router-dom";
import { ArrowLeft, Map, Swords, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SimulationProvider } from "@/components/simulation/SimulationContext";
import { SimulationBanner } from "@/components/simulation/SimulationBanner";
import { PlatformMap } from "@/components/simulation/PlatformMap";
import { SimulationSandbox } from "@/components/simulation/SimulationSandbox";
import { MissionRunner } from "@/components/simulation/MissionRunner";

function SimulationContent() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SimulationBanner />

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Swords className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">War Room Simulation</h1>
              <p className="text-sm text-muted-foreground">
                Explore the entire platform with mock data — no real actions taken.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="h-3 w-3 mr-1" />
              Exit Simulation
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="map" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="map" className="flex items-center gap-1.5">
              <Map className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Platform Map</span>
              <span className="sm:hidden">Map</span>
            </TabsTrigger>
            <TabsTrigger value="sandbox" className="flex items-center gap-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sandbox</span>
              <span className="sm:hidden">Sandbox</span>
            </TabsTrigger>
            <TabsTrigger value="missions" className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Missions</span>
              <span className="sm:hidden">Missions</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="map">
            <PlatformMap />
          </TabsContent>

          <TabsContent value="sandbox">
            <SimulationSandbox />
          </TabsContent>

          <TabsContent value="missions">
            <MissionRunner />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function Simulation() {
  return (
    <SimulationProvider>
      <SimulationContent />
    </SimulationProvider>
  );
}
