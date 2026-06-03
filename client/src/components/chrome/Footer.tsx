import { Link } from 'react-router-dom';

const YEAR = 2026; // build-time constant (client has no Date.now in SSR-safe paths)

export function Footer() {
  return (
    <footer className="border-t border-border bg-panel/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link to="/" className="flex items-center gap-2 font-bold hover:no-underline">
            <span className="text-xl">🏡</span> GroupPad
          </Link>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Plan a group trip together — browse rentals, vote, compare with AI, and lock the winner
            without the endless group chat.
          </p>
        </div>

        <FooterCol title="Product" links={[
          ['Your trips', '/trips'],
          ['Start a trip', '/trips/new'],
        ]} />
        <FooterCol title="Resources" links={[
          ['How it works', '/'],
        ]} />
        <div>
          <h4 className="text-sm font-semibold">Stay in touch</h4>
          <p className="mt-2 text-sm text-muted">Built for groups who'd rather be on the trip than in the spreadsheet.</p>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {YEAR} GroupPad. Prices are estimates — verify totals at the booking step.</span>
          <span>Made for group trips.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 space-y-1.5 text-sm">
        {links.map(([label, to]) => (
          <li key={label}>
            <Link to={to} className="text-muted hover:text-text hover:no-underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
