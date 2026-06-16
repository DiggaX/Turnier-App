const LINKS = ["Discord", "Twitch", "X", "Support"] as const;

/** Landing footer: brand copyright + social/support links. */
export function Footer() {
  return (
    <footer className="relative z-10 border-t border-line">
      <div className="mx-auto flex max-w-[1340px] flex-col items-center justify-between gap-4 px-6 py-7 sm:flex-row sm:px-10">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">
            <span className="text-lime">NL</span> Next Level
          </span>
          <span className="text-xs text-fg-muted">
            © 2026 Next Level Esports
          </span>
        </div>
        <div className="flex gap-6 font-display text-xs uppercase tracking-wider text-fg-muted">
          {LINKS.map((link) => (
            <span
              key={link}
              className="cursor-pointer transition-colors hover:text-ink"
            >
              {link}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
