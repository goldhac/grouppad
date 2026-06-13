import { SKINS, type SkinId } from '@/lib/skins';

/** A row of theme swatches. `allowFollow` adds an "Auto" option (follow the
 *  trip's default) for the personal picker. */
export function SkinPicker({
  value,
  onChange,
  allowFollow = false,
}: {
  value: SkinId | '';
  onChange: (skin: SkinId | '') => void;
  allowFollow?: boolean;
}) {
  return (
    <div className="skin-row" role="radiogroup" aria-label="Theme">
      {allowFollow && (
        <button
          type="button" role="radio" aria-checked={value === ''}
          className={`skin-sw${value === '' ? ' on' : ''}`}
          onClick={() => onChange('')} title="Follow the trip's theme"
        >
          <span className="skin-dot skin-dot-auto" />
          <span className="skin-lab">Auto</span>
        </button>
      )}
      {SKINS.map((s) => (
        <button
          type="button" key={s.id} role="radio" aria-checked={value === s.id}
          className={`skin-sw${value === s.id ? ' on' : ''}`}
          onClick={() => onChange(s.id)}
          title={`${s.label} · ${s.sub}`}
        >
          <span className="skin-dot" style={{ background: `linear-gradient(135deg, ${s.accent} 0 55%, ${s.decision} 55% 100%)` }} />
          <span className="skin-lab">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
