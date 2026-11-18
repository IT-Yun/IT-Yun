// All money is integer AUD cents. This engine evaluates one exact SKU per order.
export const money = cents => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const validTime = x => Number.isFinite(Date.parse(x));
const thresholdMet = (value, threshold, operator) => operator === 'gt' ? value > threshold : value >= threshold;
function eligible(coupon, context, subtotal, now) {
 return validTime(coupon.expiresAt) && Date.parse(coupon.expiresAt) > now
   && (!coupon.startsAt || (validTime(coupon.startsAt) && Date.parse(coupon.startsAt) <= now))
   && (!coupon.member || context.member === true)
   && (!coupon.firstOrder || context.firstOrder === true)
   && subtotal >= (coupon.minSpend ?? 0);
}
function validCoupon(c) {
 return c !== null && typeof c === 'object' && typeof c.id === 'string' && typeof c.group === 'string'
   && ['fixed','percent'].includes(c.type) && integer(c.value)
   && (c.type !== 'percent' || c.value <= 10000)
   && integer(c.minSpend ?? 0) && integer(c.cap ?? 0)
   && Number.isSafeInteger(c.order);
}
export function quoteOffer(offer, context) {
 const { quantity, variant, region, now = Date.now() } = context;
 const result = { offer, status: 'unavailable', total: null };
 const stop = reason => ({ ...result, reason });
 if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return stop('수량은 1–99개로 선택해 주세요');
 if (!Number.isFinite(now)) return stop('계산 시각 확인 필요');
 if (offer.sellerStatus !== 'approved') return { ...result, status: 'excluded', reason: '미승인 판매자' };
 if (!validTime(offer.sellerExpiresAt) || Date.parse(offer.sellerExpiresAt) <= now) return { ...result, status: 'excluded', reason: '판매처 검증 만료' };
 if (offer.variant !== variant || offer.currency !== 'AUD') return { ...result, status: 'excluded', reason: '동일 옵션 또는 통화 아님' };
 if (!validTime(offer.expiresAt) || Date.parse(offer.expiresAt) <= now) return stop('가격 확인 기한 만료');
 if (!integer(offer.unitPrice) || !integer(offer.minOrder ?? 0) || !integer(offer.stock)) return stop('가격 또는 재고 정보 확인 필요');
 if (offer.stock < quantity) return stop('선택 수량 재고 부족');
 if (!offer.regions?.includes(region)) return stop('선택 지역 배송 불가');
 let paidQuantity = quantity;
 if (offer.multibuy) {
  const { buy, free } = offer.multibuy;
  if (!Number.isInteger(buy) || buy < 1 || !integer(free) || free < 1) return stop('수량 할인 규칙 확인 필요');
  paidQuantity -= Math.floor(quantity / (buy + free)) * free;
 }
 const gross = offer.unitPrice * quantity;
 const subtotal = offer.unitPrice * paidQuantity;
 if (!integer(gross) || !integer(subtotal)) return stop('계산 범위 초과');
 if (subtotal < (offer.minOrder ?? 0)) return stop(`최소 주문 ${money(offer.minOrder)} 미달`);
 const shipping = offer.shipping;
 if (!shipping || !['before','after'].includes(shipping.basis)
     || !['gte','gt'].includes(shipping.operator)
     || !integer(shipping.fee?.[region])
     || !(shipping.threshold === null || integer(shipping.threshold))) {
  return { ...result, status: 'unknown', subtotal, reason: '배송비 또는 무료배송 기준 확인 필요' };
 }
 const allCoupons = offer.coupons ?? [];
 if (!Array.isArray(allCoupons) || allCoupons.length > 12 || allCoupons.some(c => !validCoupon(c)) || new Set(allCoupons.map(c=>c.id)).size !== allCoupons.length) {
  return { ...result, status: 'unknown', reason: '할인 규칙 확인 필요' };
 }
 const coupons = allCoupons.filter(c => eligible(c, context, subtotal, now)).sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id));
 let best;
 for (let mask=0; mask < 2 ** coupons.length; mask++) {
  const selected = coupons.filter((_,i)=>mask & (1 << i));
  if (new Set(selected.map(c=>c.group)).size !== selected.length) continue;
  let net = subtotal;
  const applied = [];
  for (const coupon of selected) {
   let discount = coupon.type === 'fixed' ? coupon.value : Number(BigInt(net) * BigInt(coupon.value) / 10000n);
   if (coupon.cap !== undefined) discount = Math.min(discount, coupon.cap);
   discount = Math.min(net, discount);
   net -= discount;
   if (discount) applied.push({ id: coupon.id, label: coupon.label, discount });
  }
  const basis = shipping.basis === 'before' ? subtotal : net;
  const free = shipping.threshold !== null && thresholdMet(basis, shipping.threshold, shipping.operator);
  const fee = free ? 0 : shipping.fee[region];
  const total = net + fee;
  if (!integer(total)) return stop('계산 범위 초과');
  const shortfall = shipping.threshold === null ? null : Math.max(0, shipping.threshold + (shipping.operator === 'gt' ? 1 : 0) - basis);
  const candidate = { ...result, status: 'estimated', gross, subtotal, net, quantityDiscount: gross-subtotal,
   couponDiscount: subtotal-net, applied, shipping: fee, total, shortfall,
   unitTotal: total/quantity, reason: '', skippedCoupon: selected.length === 0 && coupons.length > 0 };
  if (!best || total < best.total || (total === best.total && applied.length < best.applied.length)) best = candidate;
 }
 return best;
}
export function compareOffers(offers, context) {
 const results = offers.map(o=>quoteOffer(o,context)).filter(q=>q.status !== 'excluded');
 return results.sort((a,b)=>(a.total ?? Infinity)-(b.total ?? Infinity) || a.offer.id.localeCompare(b.offer.id));
}
