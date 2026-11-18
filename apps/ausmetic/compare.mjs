import { compareOffers, money } from './pricing.mjs';
import { demoOffers, demoProduct } from './demo.mjs';

const now = Date.now();
const context = { now, variant: demoProduct.variant, region: 'metro', quantity: 1 };
for (const quote of compareOffers(demoOffers(now), context)) {
  const total = quote.status === 'estimated' ? money(quote.total) : 'To be confirmed';
  console.log(quote.offer.id, total);
}
