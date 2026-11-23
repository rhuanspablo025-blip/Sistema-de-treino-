import { bodyFields } from '../lib/body-shape.mjs';

export default function MeasureInputs({ values, onChange }) {
  return <div className="measurement-form enhanced-form">
    {bodyFields.map(([key, label, unit]) => <label key={key}>{label}
      <div><input type="number" inputMode="decimal" min="0.1" step="0.1"
        max={key === 'height' ? 250 : key === 'weight' ? 500 : 300}
        value={values[key] ?? ''} onChange={e => onChange(key, e.target.value)} />
        <span>{unit}</span></div>
    </label>)}
  </div>;
}
