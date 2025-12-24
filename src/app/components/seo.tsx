import { useEffect } from 'react';

type Props = {
  title: string;
  noindex?: boolean;
};

export function Seo({ title, noindex }: Props) {
  useEffect(() => {
    document.title = title;

    const name = 'robots';
    const content = noindex ? 'noindex,nofollow' : 'index,follow';

    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);

    return () => {
      // leave the tag in place; next page will update it
    };
  }, [title, noindex]);

  return null;
}
