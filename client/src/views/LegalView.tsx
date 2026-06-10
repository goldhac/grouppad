import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileLegal } from '@/views/MobileLegal';
import { Icon } from '@/components/ui/Icon';

interface Section { h: string; body: string[] }

function LegalDoc({ eyebrow, title, updated, intro, sections }: {
  eyebrow: string; title: string; updated: string; intro: string; sections: Section[];
}) {
  return (
    <main className="uu-main">
      <div className="tp-wrap uu-wrap" style={{ maxWidth: 760 }}>
        <Link className="uu-back" to="/"><Icon icon={ArrowLeft} className="ico" /> Back to GroupPad</Link>
        <div className="help-head" style={{ marginBottom: 18 }}>
          <div className="ey">{eyebrow}</div>
          <h1>{title}</h1>
          <p>Last updated {updated}</p>
        </div>
        <article className="flex flex-col gap-7 text-[15px] leading-relaxed text-text-2">
          <p>{intro}</p>
          {sections.map((s) => (
            <section key={s.h} className="flex flex-col gap-2.5">
              <h2 className="font-display text-[19px] font-semibold text-text">{s.h}</h2>
              {s.body.map((p, i) => <p key={i}>{p}</p>)}
            </section>
          ))}
          <p className="text-sm text-text-muted">
            Questions? Email <a className="text-link hover:underline" href="mailto:hello@goldhac.com">hello@goldhac.com</a>.
          </p>
        </article>
      </div>
    </main>
  );
}

export function TermsView() {
  if (useIsMobile()) return <MobileLegal />;
  return (
    <LegalDoc
      eyebrow="Legal" title="Terms of Service" updated="June 2026"
      intro="GroupPad is a tool for planning a group trip together: collecting rental listings on a shared board, voting, comparing options, and agreeing on one place to book. By creating an account or using GroupPad, you agree to these terms. If you don’t agree, please don’t use the service."
      sections={[
        { h: 'What GroupPad is, and isn’t', body: [
          'GroupPad helps your group organize and decide. It is not a booking platform, travel agency, or payment processor. We don’t take reservations or handle money. When your group settles on a place, you book it directly with the host or listing site (Airbnb, VRBO, Booking.com, etc.) on their terms.',
          'Prices, availability, amenities, and reviews shown in GroupPad are estimates and snapshots gathered from public listing pages. They can be wrong or out of date. Always verify the all-in total and the details on the original listing before you book.',
        ]},
        { h: 'Your account', body: [
          'You sign in with Google or a one-time email link, so there’s no password to manage. You’re responsible for the activity on your account and for keeping your email secure. You must be old enough to form a binding contract in your country to use GroupPad.',
        ]},
        { h: 'Your content', body: [
          'You and your group own what you add: listing links, votes, comments, caveats, and itineraries. You grant GroupPad permission to store and display that content to the members of your trip so the product can work. Don’t post anything unlawful, abusive, or that infringes someone else’s rights.',
          'Trip organizers can manage their trip, including removing listings and members and deleting the trip. Deleting a trip removes its board and data for everyone and can’t be undone.',
        ]},
        { h: 'AI features', body: [
          'Scout, GroupPad’s AI assistant (powered by Google’s Gemini), compares homes and summarize trade-offs. AI output is a helpful opinion, not advice, and it can be wrong or incomplete. Use your own judgment before deciding.',
        ]},
        { h: 'Acceptable use', body: [
          'Don’t abuse, overload, scrape, or try to break the service, and don’t use it to violate the terms of the listing sites we link to. We may suspend accounts that do.',
        ]},
        { h: 'No warranty & liability', body: [
          'GroupPad is provided “as is,” without warranties of any kind. To the extent the law allows, we’re not liable for indirect or consequential damages, or for anything arising from a booking you make with a third party. The service may change or pause at any time.',
        ]},
        { h: 'Changes', body: [
          'We may update these terms as the product evolves. If we make a material change, we’ll note it here and update the date above. Continuing to use GroupPad means you accept the current terms.',
        ]},
      ]}
    />
  );
}

export function PrivacyView() {
  if (useIsMobile()) return <MobileLegal />;
  return (
    <LegalDoc
      eyebrow="Legal" title="Privacy Policy" updated="June 2026"
      intro="This explains what GroupPad collects, why, and your choices. The short version: we collect the minimum needed to run a shared trip board, we don’t sell your data, and we never post or email your group on your behalf without you."
      sections={[
        { h: 'What we collect', body: [
          'Account: your email address, and your name and avatar if you sign in with Google. Activity: the trips you’re in, listings you add, your votes and top choices, comments, caveats, and itinerary text. Technical: a sign-in session cookie and a small amount of browser storage (your theme and whether you’ve seen the welcome tour).',
        ]},
        { h: 'How we use it', body: [
          'To run your trip board: show your group the listings, votes, and decisions; tie your votes to you across devices; and email you trip updates if you’ve opted in. We use aggregate, non-personal usage figures to keep the service healthy.',
        ]},
        { h: 'Third parties we rely on', body: [
          'Google (sign-in), Resend (transactional email like sign-in links and digests), Apify and Firecrawl (fetching public listing details and prices), and Google Gemini (which powers Scout, the AI compare feature). These providers process only what’s needed for their function. We don’t sell or rent your personal data to anyone.',
        ]},
        { h: 'Email', body: [
          'We send sign-in links and, if you opt in, trip recap and “big moment” emails. Every email has a one-click unsubscribe, and you can change your preferences anytime from the account menu.',
        ]},
        { h: 'Retention & deletion', body: [
          'We keep your trip data while the trip exists. When an organizer deletes a trip, its board, listings, and votes are removed for everyone. Want your account and data removed entirely? Email us and we’ll take care of it.',
        ]},
        { h: 'Your choices', body: [
          'You can browse a shared board without an account, edit your notification preferences, leave a trip, or ask us to delete your data. Cookies are limited to what’s needed to sign you in and remember your display preferences.',
        ]},
      ]}
    />
  );
}
