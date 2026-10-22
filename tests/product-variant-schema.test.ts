import { describe, expect, it } from 'vitest';
import { product } from '@/cms/schemas/product';

describe('product variant schema', () => {
  it('keeps customer-selectable variants visible regardless of product type facets', () => {
    const variantsField = product.fields.find((field) => field.name === 'sizes');

    expect(variantsField).toMatchObject({ name: 'sizes', type: 'array' });
    expect(variantsField).not.toHaveProperty('components.field');
  });
});
