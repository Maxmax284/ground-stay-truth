const LivingSection = () => (
  <section className="py-24 px-6 bg-muted/30">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        Living Here
      </p>

      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-6">
        Know how things work before you arrive.
      </h2>

      <div className="space-y-4 text-muted-foreground leading-relaxed">
        <p>
          How the gym runs. What daily life looks like. How support works. What to expect from the property, the area, and the routine.
        </p>
        <p>
          This isn't a brochure. It's practical information so there's no confusion and no surprises when you show up.
        </p>
      </div>
    </div>
  </section>
);

export default LivingSection;
