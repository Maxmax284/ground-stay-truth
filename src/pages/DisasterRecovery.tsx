import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import DRSOverview from "@/components/disaster-recovery/DRSOverview";
import DRSGitRecovery from "@/components/disaster-recovery/DRSGitRecovery";
import DRSDatabaseBackup from "@/components/disaster-recovery/DRSDatabaseBackup";
import DRSEnvironment from "@/components/disaster-recovery/DRSEnvironment";
import DRSInfraMap from "@/components/disaster-recovery/DRSInfraMap";
import DRSRecoveryProtocol from "@/components/disaster-recovery/DRSRecoveryProtocol";
import DRSValidation from "@/components/disaster-recovery/DRSValidation";
import DRSAuditLog from "@/components/disaster-recovery/DRSAuditLog";

export default function DisasterRecovery() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Disaster Recovery System
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full platform recovery. Clone → Configure → Restore → Validate → Deploy.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="protocol" className="text-xs">Protocol</TabsTrigger>
            <TabsTrigger value="git" className="text-xs">Source</TabsTrigger>
            <TabsTrigger value="database" className="text-xs">Database</TabsTrigger>
            <TabsTrigger value="env" className="text-xs">Environment</TabsTrigger>
            <TabsTrigger value="infra" className="text-xs">Infrastructure</TabsTrigger>
            <TabsTrigger value="validation" className="text-xs">Validation</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs">Audit Log</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview"><DRSOverview /></TabsContent>
            <TabsContent value="protocol"><DRSRecoveryProtocol /></TabsContent>
            <TabsContent value="git"><DRSGitRecovery /></TabsContent>
            <TabsContent value="database"><DRSDatabaseBackup /></TabsContent>
            <TabsContent value="env"><DRSEnvironment /></TabsContent>
            <TabsContent value="infra"><DRSInfraMap /></TabsContent>
            <TabsContent value="validation"><DRSValidation /></TabsContent>
            <TabsContent value="audit"><DRSAuditLog /></TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
