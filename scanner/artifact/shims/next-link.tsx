import React from 'react';
import { navigate } from './router';

export default function Link({ href, children, ...rest }: { href: string; children?: React.ReactNode; className?: string; title?: string; style?: React.CSSProperties }) {
  const internal = href.startsWith('/');
  return (
    <a href={internal ? '#' : href} {...rest} onClick={(e) => { if (internal) { e.preventDefault(); navigate(href); } }}>{children}</a>
  );
}
