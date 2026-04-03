const ContextSection = () => (
  <section className="py-24 px-6 bg-background">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        The Problem
      </p>

      <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-8">
        Booking is easy.<br />
        Arrival is where things break.
      </h2>

      <div className="space-y-4 text-muted-foreground leading-relaxed">
        <p>
          The guest booked. Great. But did they get the right flight info? Do they know there's no direct flight to Samui from most international airports? Did they set up internet for when they land? Does anyone actually know when they're arriving?
        </p>
        <p>
          Usually not. Staff end up chasing. Guests end up confused. The first impression of a place becomes a scramble to figure out where everyone is and what went wrong.
        </p>
        <p className="text-foreground font-medium">
          The issue isn't the guest. The issue is the system — or the lack of one.
        </p>
      </div>
    </div>
  </section>
);

export default ContextSection;
