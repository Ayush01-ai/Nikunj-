export const SIZE_GUIDE_PATH = '/laddu-gopal-size-guide';

/** Categories sold by Laddu Gopal size number, which link to the size guide. */
const SIZED_CATEGORIES = new Set(['poshak-vastra', 'bedding-set', 'deity-shringar']);

export const hasSizeGuide = (categorySlug?: string | null) => !!categorySlug && SIZED_CATEGORIES.has(categorySlug);
