import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

export default function ProfileEditor() {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const currentName = fullName ?? profile.data?.full_name ?? "";
  const currentPhone = phone ?? profile.data?.phone ?? "";

  const handleSave = () => {
    updateProfile.mutate({ full_name: currentName, phone: currentPhone });
  };

  if (profile.isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">My Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">My Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user?.email ?? ""} disabled className="bg-muted" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            value={currentName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={currentPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
          />
        </div>
        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
