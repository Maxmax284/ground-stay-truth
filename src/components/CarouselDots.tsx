import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { CarouselApi } from "@/components/ui/carousel";

interface CarouselDotsProps {
  api: CarouselApi | undefined;
  count: number;
}

export function CarouselDots({ api, count }: CarouselDotsProps) {
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (!api) return;
    setSelected(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api, onSelect]);

  if (count <= 1) return null;

  return (
    <div className="flex justify-center gap-1.5 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => api?.scrollTo(i)}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === selected
              ? "w-4 bg-primary"
              : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
          )}
          aria-label={`Go to photo ${i + 1}`}
        />
      ))}
    </div>
  );
}
