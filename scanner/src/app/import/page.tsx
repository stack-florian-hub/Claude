import ImportPanel from '@/components/ImportPanel';
import { LISTING_PROVIDERS } from '@/lib/providers/listing';

export default function ImportPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Import d’annonces</h1>
          <p className="muted">Sans API payante : collage, fichiers, saisie, capture navigateur. Chaque annonce est découpée en lots et comparée à la DVF avant import.</p>
        </div>
      </div>
      <ImportPanel />
      <div className="panel">
        <h3>Sources branchées (ListingProvider)</h3>
        <table>
          <tbody>
            {LISTING_PROVIDERS.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>{p.available ? <span className="tag good">actif</span> : <span className="tag grey">à brancher</span>}</td>
                <td className="wrap muted">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
