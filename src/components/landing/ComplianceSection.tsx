const ComplianceSection = () => (
  <section className="py-24 px-6 bg-muted/30">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        What We Don't Do
      </p>

      <div className="border border-border rounded-sm p-8 bg-card">
        <p className="text-sm text-foreground font-medium mb-6">
          LMT CampStay is an operational coordination system. It is not a replacement for personal responsibility or external authorities.
        </p>

        <div className="space-y-3 mb-8">
          {[
            "Does not control immigration processes",
            "Does not control airline schedules",
            "Does not guarantee timing if flights change",
            "Does not replace traveler responsibility",
          ].map((line) => (
            <p key={line} className="text-sm text-muted-foreground flex gap-3 items-start">
              <span className="text-destructive shrink-0 mt-0.5 text-xs">✕</span>
              <span>{line}</span>
            </p>
          ))}
        </div>

        <div className="border-t border-border pt-6">
          <p className="text-sm text-foreground font-medium mb-3">
            Internet access on arrival is required.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Real-time coordination depends on the guest having an active internet connection upon landing (SIM, eSIM, or roaming). If the guest is offline, the system cannot guide or coordinate in real time. The pre-arrival checklist addresses this directly.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default ComplianceSection;
