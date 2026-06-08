import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

const TERMS = {
  title: 'Terms of Service', updated: 'June 2026',
  intro: 'GroupPad is a tool for planning a group trip together — collecting rental listings on a shared board, voting, comparing options, and agreeing on one place to book. By creating an account or using GroupPad, you agree to these terms.',
  secs: [
    ["What GroupPad is — and isn't", "GroupPad helps your group organize and decide. It is not a booking platform, travel agency, or payment processor — we don't take reservations or handle money. When your group settles on a place, you book it directly with the host or listing site. Prices, availability, and details shown are estimates from public listing pages and can be out of date — always verify on the original listing before you book."],
    ['Your account', "You sign in with Google or a one-time email link — no password to manage. You're responsible for activity on your account and for keeping your email secure."],
    ['Your content', "You and your group own what you add — links, votes, comments, caveats, itineraries. You grant GroupPad permission to store and display that content to your trip's members so the product works. Organizers can remove listings/members and delete the trip; deletion is permanent."],
    ['AI features', "Scout (powered by Google's Gemini) compares homes and summarizes trade-offs. AI output is a helpful opinion, not advice — it can be wrong. Use your own judgment before deciding."],
    ['No warranty & liability', 'GroupPad is provided "as is." To the extent the law allows, we\'re not liable for indirect damages or for anything arising from a booking you make with a third party.'],
  ],
};
const PRIVACY = {
  title: 'Privacy Policy', updated: 'June 2026',
  intro: "The short version: we collect the minimum needed to run a shared trip board, we don't sell your data, and we never post or email your group on your behalf without you.",
  secs: [
    ['What we collect', "Account: your email, plus name and avatar if you use Google. Activity: trips you're in, listings you add, votes, comments, caveats, and itinerary text. Technical: a sign-in cookie and a little browser storage (theme + whether you've seen the tour)."],
    ['How we use it', 'To run your trip board — show your group the listings, votes, and decisions; tie your votes to you across devices; and email trip updates if you opt in. Aggregate usage figures keep the service healthy.'],
    ['Third parties', "Google (sign-in), Resend (email), Apify and Firecrawl (public listing details and prices), and Google Gemini (Scout). Each processes only what's needed. We don't sell or rent your personal data."],
    ['Email', 'We send sign-in links and, if you opt in, trip recap and "big moment" emails. Every email has one-click unsubscribe; change preferences anytime from the account menu.'],
    ['Your choices', 'Browse a shared board without an account, edit notification preferences, leave a trip, or ask us to delete your data. Cookies are limited to sign-in and display preferences.'],
  ],
};

export function MobileLegal() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const isPrivacy = loc.pathname.includes('privacy');
  const doc = isPrivacy ? PRIVACY : TERMS;
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); try { localStorage.setItem('gp_theme', next); } catch { /**/ } setTheme(next); };

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="mb-top"><div className="al-top"><div className="row">
          <span className="al-back" onClick={() => navigate('/')}><Icon icon={ArrowLeft} className="ico" /> GroupPad</span>
          <span className="ttl">Legal</span><span className="sp" />
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
        </div></div></div>
        <div className="mb-scroll" style={{ paddingBottom: 24 }}>
          <div className="al-doc">
            <div className="ey">Legal</div><h1>{doc.title}</h1><div className="updated">Last updated {doc.updated}</div>
            <div className="al-toggle">
              <button className={isPrivacy ? '' : 'on'} onClick={() => navigate('/terms')}>Terms</button>
              <button className={isPrivacy ? 'on' : ''} onClick={() => navigate('/privacy')}>Privacy</button>
            </div>
            <p className="intro">{doc.intro}</p>
            {doc.secs.map(([h, p]) => <section key={h}><h2>{h}</h2><p>{p}</p></section>)}
            <div className="contact">Questions? Email <a href="mailto:hello@goldhac.com">hello@goldhac.com</a>.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
