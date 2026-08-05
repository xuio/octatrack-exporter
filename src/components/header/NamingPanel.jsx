import Field from '../ui/Field.jsx';

/**
 * Naming lives in the header so the suffix that ends up in every exported file
 * name — and both output archive names — can be set from any step.
 */
export default function NamingPanel({ abbrev, zipName, zipPlaceholder, projectName, projectPlaceholder, previews, onAbbrev, onZipName, onProjectName }) {
  return (
    <div className="theme-picker" style={{ position: 'relative', flex: 'none' }}>
      <button className="stp" title="File naming">Naming</button>
      <div className="theme-menu" style={{ minWidth: 320, padding: 10 }}>
        <Field
          label="Song abbreviation — appended to every stem file"
          value={abbrev}
          onChange={onAbbrev}
          placeholder="e.g. Shake"
          hint={`${previews.wav} · ${previews.ot}`}
          style={{ marginBottom: 8 }}
        />
        <Field
          label="Stems ZIP name"
          value={zipName}
          onChange={onZipName}
          placeholder={zipPlaceholder}
          hint={previews.zip}
          style={{ marginBottom: 8 }}
        />
        <Field
          label="Project folder / ZIP name"
          value={projectName}
          onChange={onProjectName}
          placeholder={projectPlaceholder}
          hint={previews.project}
        />
      </div>
    </div>
  );
}
