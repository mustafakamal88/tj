import { useEffect } from 'react';

type SeoProps = {
  title: string;
  noindex?: boolean;
};

export function Seo({ title, noindex }: SeoProps) {
  useEffect(() => {
    document.title = title;

    const name = 'robots';
    let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }

    meta.setAttribute('content', noindex ? 'noindex,nofollow' : 'index,follow');
  }, [title, noindex]);

  return null;
}
