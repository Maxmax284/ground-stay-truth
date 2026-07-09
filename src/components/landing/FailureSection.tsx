const FailureSection = () => (
  <section className="py-24 px-6 bg-[hsl(var(--fight-dark))] text-[hsl(36,33%,97%)]">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-[hsl(36,20%,45%)] mb-8">
        When Things Go Wrong
      </p>

      <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-8">
        Flights change. People send wrong info. Internet drops.
      </h2>

      <div className="space-y-4 text-[hsl(36,20%,65%)] leading-relaxed">
        <p>
          Most systems either break silently or keep running on bad data. LMT CampStay does neither.
        </p>
        <p>
          When something doesn't add up, the system slows down. It flags the issue. It surfaces what's actually known and what isn't. Then it hands control to real staff — people who can make a judgment call, not an algorithm guessing.
        </p>
      </div>

      <div className="mt-12 border border-[hsl(36,20%,18%)] rounded-sm p-6 space-y-3">
        {[
          "No blind automation",
          "No silent overrides",
          "No guessing",
          "Controlled decisions based on what is actually happening",
        ].map((line) => (
          <p key={line} className="text-sm text-[hsl(36,20%,55%)] flex gap-3 items-start">
            <span className="text-[hsl(var(--fight-gold))] shrink-0 mt-0.5 text-xs">■</span>
            <span>{line}</span>
          </p>
        ))}
      </div>
    </div>
  </section>
);

export default FailureSection;
