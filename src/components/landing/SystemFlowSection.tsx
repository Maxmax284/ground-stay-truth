const phases = [
  {
    label: "01",
    title: "Before You Fly",
    items: [
      "Thailand arrival card (TDAC) — guidance, not enforcement",
      "Correct flight details including domestic connections",
      "Understanding the pickup process",
      "Internet readiness for arrival coordination",
      "If internet is missing on landing, the system cannot coordinate in real time",
    ],
  },
  {
    label: "02",
    title: "While You're Traveling",
    items: [
      "Monitors the journey using available API data",
      "Understands where the guest should be based on route logic",
      "Follows the route into Thailand including connections",
      "Adapts when information changes or becomes unavailable",
      "Flight tracking is API-assisted and availability-dependent — not guaranteed",
    ],
  },
  {
    label: "03",
    title: "When You Land",
    items: [
      "Connect to internet",
      "Confirm arrival through the system",
      "Pickup is coordinated based on confirmed status",
      "Staff have visibility before the guest even exits the airport",
    ],
  },
];

const SystemFlowSection = () => (
  <section className="py-24 px-6 bg-muted/30">
    <div className="max-w-4xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        How It Works
      </p>

      <div className="space-y-16">
        {phases.map((phase) => (
          <div key={phase.label} className="flex gap-6 sm:gap-10">
            <div className="shrink-0">
              <span className="font-stat text-3xl sm:text-4xl font-bold text-border">
                {phase.label}
              </span>
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-4">
                {phase.title}
              </h3>
              <ul className="space-y-2">
                {phase.items.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground leading-relaxed flex gap-2">
                    <span className="text-border mt-1 shrink-0">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default SystemFlowSection;
