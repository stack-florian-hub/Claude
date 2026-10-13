'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/opportunites', 'Opportunités'],
  ['/import', 'Import d’annonces'],
  ['/pipeline', 'Pipeline'],
  ['/tresorerie', 'Trésorerie'],
  ['/groupe', 'Groupe'],
  ['/parametres', 'Paramètres'],
];

export default function Nav() {
  const p = usePathname();
  return (
    <nav className="nav">
      <div className="brand">Scanner MdB</div>
      <div className="sub">Groupe TUÉ et Fils</div>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={p.startsWith(href) ? 'on' : ''}>
          {label}
        </Link>
      ))}
      <div className="foot">Annonces × DVF · local</div>
    </nav>
  );
}
