import { useEffect } from "react";
import { Link } from "react-router-dom";
import { TheRockReader } from "@/components/the-rock/TheRockReader";

/** Public, booking-free English edition of THE ROCK. No guest data is loaded here. */
export default function IslandGuide() {
  useEffect(() => {
    document.title = "THE ROCK — Koh Samui Field Manual | Lamai Muay Thai";
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-sm">
          <span className="font-stat tracking-widest text-primary">LMT // THE ROCK</span>
          <Link to="/stay" className="text-muted-foreground hover:text-foreground">Stay with us</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">
        <TheRockReader />
      </main>
    </div>
  );
}
