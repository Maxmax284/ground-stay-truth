const ProofSection = () => (
  <section className="py-24 px-6 bg-muted/30">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        Proof of Work
      </p>

      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-6">
        No inflated claims. Just evidence.
      </h2>

      <div className="space-y-4 text-muted-foreground leading-relaxed mb-12">
        <p>
          Ground Stay is backed by structured system architecture, real operational workflows, and continuous development history. It's in active use coordinating real arrivals at a real property.
        </p>
        <p>
          We don't claim global scale. We don't cite fabricated adoption numbers. What exists is the work itself — the tables, the policies, the functions, the edge cases handled, the commits logged.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: "Development History", detail: "Version-controlled, traceable builds" },
          { label: "System Architecture", detail: "RBAC, RLS, state machines, audit logging" },
          { label: "Operational Use", detail: "Live coordination at property level" },
        ].map((item) => (
          <div key={item.label} className="border border-border rounded-sm p-5">
            <p className="text-sm font-medium text-foreground mb-1">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default ProofSection;
