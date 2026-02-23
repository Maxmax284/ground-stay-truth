import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useTutorial() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [localShow, setLocalShow] = useState(false);

  const { data: tutorialCompleted, isLoading } = useQuery({
    queryKey: ["tutorial", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("tutorial_completed")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.tutorial_completed ?? false;
    },
  });

  useEffect(() => {
    if (!isLoading && tutorialCompleted === false) {
      setLocalShow(true);
    }
  }, [isLoading, tutorialCompleted]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ tutorial_completed: true } as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tutorial"] });
      setLocalShow(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ tutorial_completed: false } as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tutorial"] });
      setLocalShow(true);
    },
  });

  const completeTutorial = useCallback(() => completeMutation.mutate(), [completeMutation]);
  const resetTutorial = useCallback(() => resetMutation.mutate(), [resetMutation]);

  return {
    showTutorial: localShow && !isLoading,
    isLoading,
    completeTutorial,
    resetTutorial,
    isResetting: resetMutation.isPending,
  };
}
