import type { DocumentActionComponent } from 'sanity';

// Embedded Studio (/studio) shares the site's origin; the hosted Studio links to production.
export const siteOrigin = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/studio')
    ? window.location.origin
    : 'https://nikunjsakhi.com';

export const ViewProductOnSiteAction: DocumentActionComponent = (props) => {
  const published = props.published as { slug?: { current?: string }; isActive?: boolean } | null;
  if (!published) return null;

  const path = `/products/${published.slug?.current || props.id}`;
  return {
    label: 'View on site',
    title: published.isActive === false ? 'This product is hidden on the site' : undefined,
    disabled: published.isActive === false,
    onHandle: () => {
      window.open(`${siteOrigin()}${path}`, '_blank', 'noopener,noreferrer');
      props.onComplete();
    },
  };
};
