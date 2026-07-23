import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Eye, RefreshCw, FileText, Mail, Download } from "lucide-react";

interface PreviewResult {
  pdf_base64: string;
  email_html: string;
  email_subject: string;
  policy: Record<string, string>;
}

/**
 * Live preview of the confirmation PDF + email using CURRENT saved policy values.
 * Renders a synthetic sample booking through the same edge function stack —
 * nothing is written, nothing is sent.
 */
export function LiveConfirmationPreview() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewResult | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("preview-confirmation-samples", {
        body: {},
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as PreviewResult);
    } catch (e: any) {
      toast({
        title: "Preview failed",
        description: e?.message || "Could not generate preview",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const pdfSrc = data ? `data:application/pdf;base64,${data.pdf_base64}` : "";

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Live Preview
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Renders the confirmation PDF and email with the values you have
              saved right now. Uses a synthetic sample booking — nothing is
              written or sent.
            </CardDescription>
          </div>
          <Button size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {data ? "Refresh Preview" : "Load Preview"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-[520px] w-full" />
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Load the preview to see exactly what guests will receive with your
            current business name, phone, address, and check-in / check-out
            times.
          </div>
        ) : (
          <Tabs defaultValue="pdf" className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="pdf" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </TabsTrigger>
                <TabsTrigger value="email" className="gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" /> Email
                </TabsTrigger>
              </TabsList>
              <a
                href={pdfSrc}
                download="booking-confirmation-preview.pdf"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </a>
            </div>

            <TabsContent value="pdf" className="mt-0">
              <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/20">
                <iframe
                  title="Confirmation PDF preview"
                  src={pdfSrc}
                  className="w-full h-[600px] bg-white"
                />
              </div>
            </TabsContent>

            <TabsContent value="email" className="mt-0 space-y-2">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Subject:</span>{" "}
                {data.email_subject}
              </div>
              <div className="rounded-lg border border-border/60 overflow-hidden bg-white">
                <iframe
                  title="Confirmation email preview"
                  srcDoc={data.email_html}
                  className="w-full h-[600px] bg-white"
                  sandbox=""
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
