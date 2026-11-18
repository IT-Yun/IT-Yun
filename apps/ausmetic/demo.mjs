// Explicitly fictional stores and prices. No external purchasing links.
export const demoProduct = { id: 'demo', brand: 'AUSMETIC LAB', name: '하이드레이팅 세럼', category: '세럼', color: 'blue', variant: 'demo-serum-50ml', size: '50 mL · 단품', demo: true };
export function demoOffers(now = Date.now()) {
 const expiresAt = new Date(now + 86400000).toISOString();
 const base = { variant: demoProduct.variant, currency:'AUD', sellerStatus:'approved', sellerExpiresAt:expiresAt, expiresAt, stock:99, regions:['metro','regional'] };
 const coupon = (id, label, value, extra = {}) => ({ id, label, type:'fixed', value, group:'order', order:1, expiresAt, ...extra });
 return [
  { ...base, id:'a', name:'보태니컬 스토어', note:'가상 판매처 A', unitPrice:2400, shipping:{ fee:{metro:795,regional:1295}, threshold:7000,basis:'after',operator:'gte'}, coupons:[coupon('member','회원 $5 할인',500,{member:true,minSpend:4000})] },
  { ...base, id:'b', name:'스킨 셀렉트', note:'가상 판매처 B', unitPrice:2800, shipping:{ fee:{metro:0,regional:695},threshold:null,basis:'after',operator:'gte'}, coupons:[coupon('welcome','첫 주문 10% 할인',1000,{type:'percent',firstOrder:true,cap:800})] },
  { ...base, id:'c', name:'데일리 뷰티', note:'가상 판매처 C', unitPrice:2600, multibuy:{buy:2,free:1}, shipping:{fee:{metro:695,regional:995},threshold:5000,basis:'after',operator:'gte'}, coupons:[] },
  { ...base, id:'d', name:'글로우 마켓', note:'가상 판매처 D', unitPrice:2500, shipping:{fee:{metro:800,regional:1200},threshold:5000,basis:'after',operator:'gte'}, coupons:[coupon('small','자동 $3 할인',300,{minSpend:5000})] },
  { ...base, id:'e', name:'퓨어 셸프', note:'가상 판매처 E', unitPrice:2100, shipping:null, coupons:[] },
  { ...base, id:'hidden', name:'미검증 입점 판매자', unitPrice:1000, sellerStatus:'pending', shipping:null, coupons:[] }
 ];
}
