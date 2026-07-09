import { Link } from "react-router-dom";
import lamaiLogo from "@/assets/lamai-logo.png";

const FinalCTASection = () => (
  <section className="py-24 px-6 bg-[hsl(var(--fight-dark))]">
    <div className="max-w-3xl mx-auto text-center">
      <p className="text-[hsl(36,20%,55%)] text-sm leading-relaxed mb-2">
        Most platforms help you book.
      </p>
      <p className="text-[hsl(36,33%,97%)] text-lg sm:text-xl font-medium mb-2">
        LMT CampStay makes sure you actually arrive — and things work when you do.
      </p>
      <p className="text-[hsl(36,20%,45%)] text-sm mb-12">
        Now landing doesn't have to feel like a boss fight anymore 😏
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
        <Link
          to="/stay"
          className="group flex items-center justify-center gap-3 px-8 py-4 border border-[hsl(36,20%,25%)] hover:border-[hsl(36,20%,40%)] transition-all duration-300 rounded-sm"
        >
          <span className="text-sm font-medium tracking-wide text-[hsl(36,20%,80%)] group-hover:text-[hsl(36,33%,97%)] transition-colors">
            Enter Your Stay
          </span>
          <span className="text-[hsl(36,20%,35%)] group-hover:text-[hsl(36,20%,60%)] transition-colors">→</span>
        </Link>

        <Link
          to="/auth"
          className="group flex items-center justify-center gap-3 px-8 py-4 border border-[hsl(36,20%,30%)] hover:border-[hsl(36,20%,50%)] active:border-[hsl(36,20%,60%)] transition-all duration-300 rounded-sm cursor-pointer"
        >
          <span className="text-sm font-medium tracking-wide text-[hsl(36,20%,75%)] group-hover:text-[hsl(36,20%,95%)] transition-colors">
            Staff Login
          </span>
          <span className="text-[hsl(36,20%,45%)] group-hover:text-[hsl(36,20%,65%)] transition-colors">→</span>
        </Link>
      </div>

      {/* Footer */}
      <div className="border-t border-[hsl(36,20%,15%)] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src={lamaiLogo} alt="Lamai Muay Thai" className="h-4 w-4 opacity-35" loading="lazy" />
          <span className="text-[10px] tracking-[0.15em] uppercase text-[hsl(36,20%,28%)]">
            Powered by Lamai Muay Thai
          </span>
        </div>
        <a
          href="#built-from-inside"
          className="text-[10px] tracking-[0.15em] uppercase text-[hsl(36,20%,28%)] hover:text-[hsl(36,20%,55%)] transition-colors"
        >
          Built From Inside ↑
        </a>
      </div>
    </div>
  </section>
);

export default FinalCTASection;
