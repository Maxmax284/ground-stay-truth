import { Link } from "react-router-dom";
import lamaiCampLogo from "@/assets/lamai-camp-logo.jpg";

const EntrySection = () => (
  <section className="min-h-[85vh] flex flex-col relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--fight-dark))] via-[hsl(24,15%,12%)] to-[hsl(16,20%,14%)]" />
    <div className="absolute inset-0 opacity-[0.03]" style={{
      backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 60px, hsl(var(--fight-gold) / 0.15) 60px, hsl(var(--fight-gold) / 0.15) 61px)`,
    }} />

    {/* Nav bar */}
    <nav className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img
          src={lamaiCampLogo}
          alt="Lamai Muay Thai Camp"
          className="h-10 w-10 rounded-full object-cover border border-[hsl(36,20%,25%)]"
          loading="lazy"
        />
        <span className="text-xs tracking-[0.2em] uppercase text-[hsl(36,20%,50%)] font-medium">
          Ground Stay
        </span>
      </div>
      <a
        href="#built-from-inside"
        className="text-[10px] tracking-[0.15em] uppercase text-[hsl(36,20%,38%)] hover:text-[hsl(36,20%,65%)] transition-colors"
      >
        Built From Inside
      </a>
    </nav>

    {/* Main content */}
    <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-20 flex-1 flex items-center">
      <div className="flex flex-col lg:flex-row items-start justify-between gap-16 w-full">
        {/* Left — Identity */}
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--success))] animate-pulse" />
            <span className="text-xs tracking-[0.3em] uppercase text-[hsl(36,20%,55%)] font-medium">
              System Active
            </span>
          </div>

          <h1 className="font-stat text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[hsl(36,33%,97%)] leading-[0.95] mb-6">
            GROUND STAY
          </h1>

          <p className="text-lg sm:text-xl text-[hsl(36,20%,70%)] leading-relaxed mb-4 max-w-lg">
            Powered by Lamai Muay Thai
          </p>

          <p className="text-sm text-[hsl(36,20%,45%)] leading-relaxed max-w-md">
            An arrival and stay operating system built from real operations on Koh Samui. Not a booking platform. Not a marketing page. Infrastructure.
          </p>
        </div>

        {/* Right — Entry Points */}
        <div className="flex flex-col gap-4 lg:pt-12">
          <Link
            to="/stay"
            className="group flex items-center gap-4 px-8 py-4 border border-[hsl(36,20%,25%)] hover:border-[hsl(36,20%,40%)] transition-all duration-300 rounded-sm"
          >
            <span className="text-sm font-medium tracking-wide text-[hsl(36,20%,80%)] group-hover:text-[hsl(36,33%,97%)] transition-colors">
              Enter Your Stay
            </span>
            <span className="text-[hsl(36,20%,35%)] group-hover:text-[hsl(36,20%,60%)] transition-colors">→</span>
          </Link>

          <Link
            to="/auth"
            className="group flex items-center gap-4 px-8 py-4 border border-[hsl(36,20%,18%)] hover:border-[hsl(36,20%,30%)] transition-all duration-300 rounded-sm"
          >
            <span className="text-xs font-medium tracking-wide text-[hsl(36,20%,40%)] group-hover:text-[hsl(36,20%,65%)] transition-colors">
              Manage Property
            </span>
            <span className="text-[hsl(36,20%,25%)] group-hover:text-[hsl(36,20%,45%)] transition-colors">→</span>
          </Link>
        </div>
      </div>
    </div>

  </section>
);

export default EntrySection;
