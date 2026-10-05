import { product } from './product';
import { category } from './category';
import { deity } from './deity';
import { productType } from './productType';
import { fragrance } from './fragrance';
import { order } from './order';
import { customer } from './customer';
import { heroSlide } from './heroSlide';
import { testimonial } from './testimonial';
import { coupon } from './coupon';
import { siteSettings } from './siteSettings';
import { adminSettings } from './adminSettings';

export const schema = {
  types: [
    product,
    category,
    deity,
    productType,
    fragrance,
    order,
    customer,
    heroSlide,
    testimonial,
    coupon,
    siteSettings,
    adminSettings,
  ],
};
