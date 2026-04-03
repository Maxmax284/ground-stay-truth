const MessagingSection = () => (
  <section className="py-24 px-6 bg-background">
    <div className="max-w-3xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-8">
        Real-World Input
      </p>

      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-6">
        Built for messy data, because real data is messy.
      </h2>

      <div className="space-y-4 text-muted-foreground leading-relaxed">
        <p>
          Guests send screenshots. PDFs. Half-complete booking confirmations. Emails forwarded three times with the wrong date highlighted.
        </p>
        <p>
          The system accepts all of it. Staff review and extract the correct information. Everything is logged. Nothing is assumed. Nothing is silently overwritten.
        </p>
        <p>
          AI assists with extraction and drafting — but it does not make decisions. Staff approve. Staff correct. The system records.
        </p>
      </div>
    </div>
  </section>
);

export default MessagingSection;
