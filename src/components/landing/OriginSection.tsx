const OriginSection = () => (
  <section className="py-24 px-6 bg-background">
    <div className="max-w-3xl mx-auto">
      {/* Why */}
      <div className="mb-20">
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
          Why This Exists
        </p>

        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            This wasn't built in a boardroom. It came from the back-end operations of a Muay Thai gym on Koh Samui.
          </p>
          <p>
            Nikki Beale ran operations and saw the same gaps repeat — guests confused before they even landed, staff overloaded with preventable problems, arrivals consistently messy. Not because anyone was doing their job badly, but because there was no system underneath it.
          </p>
          <p className="text-foreground font-medium">
            Instead of working around it, she decided to build something to fix it.
          </p>
        </div>
      </div>

      {/* How */}
      <div>
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
          How It Was Built
        </p>

        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Not outsourced. Not handed to an external dev team. Brought to life by someone inside the system — a fighter training and working under that same environment.
          </p>
          <p>
            Built from direct experience. Built using modern low-code technology, pushed far beyond what most people thought low-code could handle at this level of depth — role-based access control, state machines, real-time tracking, security policies, multi-layered operational workflows.
          </p>
          <p>
            People said this level of system depth wasn't possible without a traditional engineering team. This is the proof that it is.
          </p>
          <p className="text-foreground font-medium">
            Built from actual use. Actual problems. Actual operations.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default OriginSection;
