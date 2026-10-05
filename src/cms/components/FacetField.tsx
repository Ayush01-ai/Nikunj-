import { useEffect, useState } from 'react';
import { useClient, useFormValue, type FieldProps } from 'sanity';

const facetCache = new Map<string, string[] | null>();

/** Field wrapper that only renders when the selected Product Type uses one of `facets`. */
export function facetField(facets: string[], titles?: Partial<Record<string, string>>) {
  function FacetField(props: FieldProps) {
    const typeId = (useFormValue(['productType']) as { _ref?: string } | undefined)?._ref;
    const client = useClient({ apiVersion: '2024-01-01' });
    const [typeFacets, setTypeFacets] = useState<string[] | null>(typeId ? facetCache.get(typeId) ?? null : null);

    useEffect(() => {
      if (!typeId) {
        setTypeFacets(null);
        return;
      }
      if (facetCache.has(typeId)) {
        setTypeFacets(facetCache.get(typeId) ?? null);
        return;
      }
      let cancelled = false;
      client
        .fetch<string[] | null>('*[_id == $typeId][0].appliesFacets', { typeId })
        .then((result) => {
          facetCache.set(typeId, result ?? null);
          if (!cancelled) setTypeFacets(result ?? null);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [typeId, client]);

    const hasValue = Array.isArray(props.value) ? props.value.length > 0 : props.value !== undefined;
    const matched = typeFacets?.find((f) => facets.includes(f));
    // Unconfigured types show every field; never hide a field that already holds data.
    if (typeFacets && typeFacets.length > 0 && !matched && !hasValue) return null;

    const title = (matched && titles?.[matched]) || props.title;
    return props.renderDefault({ ...props, title });
  }
  return FacetField;
}
