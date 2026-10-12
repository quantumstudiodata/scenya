// Degradado de respaldo para series sin portada, estable por slug.
export function tone(slug: string) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `t${h % 8}`;
}

export function posterProps(s: { slug: string; poster_url: string | null }) {
  return s.poster_url
    ? { className: "", style: { backgroundImage: `url(${s.poster_url})` } }
    : { className: tone(s.slug), style: undefined };
}
