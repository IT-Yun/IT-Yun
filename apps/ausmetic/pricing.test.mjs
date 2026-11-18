import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteOffer, compareOffers } from './pricing.mjs';
import { demoOffers, demoProduct } from './demo.mjs';
const now=Date.parse('2026-10-25T00:00:00Z');
const context={quantity:1,variant:'sku',region:'metro',member:false,firstOrder:false,now};
const base=()=>({id:'a',sellerStatus:'approved',sellerExpiresAt:'2027-01-01T00:00:00Z',variant:'sku',currency:'AUD',expiresAt:'2026-11-01T00:00:00Z',unitPrice:5000,stock:99,regions:['metro'],shipping:{fee:{metro:800},threshold:5000,basis:'after',operator:'gte'},coupons:[]});
const coupon=(extra={})=>({id:'coupon',label:'쿠폰',type:'fixed',value:300,group:'order',order:1,expiresAt:'2026-11-01T00:00:00Z',...extra});
test('무료배송 1센트 아래·동일·위 경계',()=>{
 for(const [price,fee] of [[4999,800],[5000,0],[5001,0]])assert.equal(quoteOffer({...base(),unitPrice:price},context).shipping,fee);
});
test('초과 기준은 정확히 기준 금액에서 유료',()=>{
 const offer=base();offer.shipping.operator='gt';assert.equal(quoteOffer(offer,context).shipping,800);assert.equal(quoteOffer(offer,context).shortfall,1);
 assert.equal(quoteOffer({...offer,unitPrice:5001},context).shipping,0);
});
test('쿠폰 때문에 무료배송을 잃으면 쿠폰을 안 쓰는 총액 선택',()=>{
 const q=quoteOffer({...base(),coupons:[coupon()]},context);assert.equal(q.total,5000);assert.equal(q.applied.length,0);assert.equal(q.skippedCoupon,true);
});
test('할인 전 배송 기준이면 쿠폰을 사용',()=>{
 const o=base();o.shipping.basis='before';o.coupons=[coupon()];const q=quoteOffer(o,context);assert.equal(q.total,4700);assert.equal(q.applied.length,1);
});
test('배송비보다 더 큰 쿠폰은 유료배송이어도 이득',()=>{
 assert.equal(quoteOffer({...base(),coupons:[coupon({value:1000})]},context).total,4800);
});
test('회원과 첫 주문 자격을 모르면 할인을 적용하지 않음',()=>{
 const o={...base(),unitPrice:10000,coupons:[coupon({member:true,firstOrder:true,value:1000})]};
 assert.equal(quoteOffer(o,context).total,10000);assert.equal(quoteOffer(o,{...context,member:true}).total,10000);assert.equal(quoteOffer(o,{...context,member:true,firstOrder:true}).total,9000);
});
test('만료 시각과 동일한 쿠폰 및 미래 시작 쿠폰 제외',()=>{
 for(const extra of [{expiresAt:'2026-10-25T00:00:00Z'},{startsAt:'2026-10-26T00:00:00Z'},{expiresAt:'invalid'}])assert.equal(quoteOffer({...base(),unitPrice:10000,coupons:[coupon(extra)]},context).total,10000);
});
test('쿠폰 중복 불가 그룹과 순차 할인·상한 계산',()=>{
 const o={...base(),unitPrice:10000,coupons:[coupon({id:'a',value:1000}),coupon({id:'b',value:1500}),coupon({id:'c',group:'product',type:'percent',value:2000,cap:1000,order:0})]};
 const q=quoteOffer(o,context);assert.equal(q.total,7500);assert.deepEqual(q.applied.map(c=>c.id),['c','b']);
});
test('정률 쿠폰은 센트 내림, 결제액 아래로 할인하지 않음',()=>{
 const o=base();o.unitPrice=1001;o.shipping.fee.metro=0;o.coupons=[coupon({type:'percent',value:1500})];assert.equal(quoteOffer(o,context).total,851);
 o.coupons=[coupon({value:99999})];assert.equal(quoteOffer(o,context).total,0);
});
test('최소 쿠폰 금액 미달은 적용 제외',()=>{
 assert.equal(quoteOffer({...base(),coupons:[coupon({minSpend:5001,value:1000})]},context).total,5000);
});
test('수량 2+1은 3개와 6개 단위에만 적용',()=>{
 const o={...base(),unitPrice:2000,multibuy:{buy:2,free:1}};
 for(const [quantity,subtotal] of [[1,2000],[2,4000],[3,4000],[4,6000],[6,8000]])assert.equal(quoteOffer(o,{...context,quantity}).subtotal,subtotal);
});
test('배송비 미확인은 0원이 아니며 순위 뒤로 분리',()=>{
 const q=compareOffers([{...base(),id:'unknown',unitPrice:1,shipping:null},base()],context);assert.equal(q[0].offer.id,'a');assert.equal(q[1].total,null);assert.equal(q[1].status,'unknown');
});
test('무료배송 기준 미정·정책 미지원도 미확인',()=>{
 for (const patch of [{basis:'unknown'},{operator:'approximately'},{threshold:undefined},{fee:{}}])assert.equal(quoteOffer({...base(),shipping:{...base().shipping,...patch}},context).status,'unknown');
});
test('미승인·승인 만료·옵션 불일치·다른 통화 제외',()=>{
 for(const patch of [{sellerStatus:'pending'},{sellerExpiresAt:'2026-10-24T00:00:00Z'},{variant:'different-size'},{currency:'KRW'}])assert.equal(compareOffers([{...base(),...patch}],context).length,0);
});
test('오래된 가격·부족 재고·배송 불가·최소 주문 실패',()=>{
 for(const patch of [{expiresAt:'2026-10-25T00:00:00Z'},{stock:0},{regions:[]},{minOrder:5001}])assert.equal(quoteOffer({...base(),...patch},context).status,'unavailable');
});
test('잘못된 수량·센트·재고를 계산하지 않음',()=>{
 for(const quantity of [0,-1,1.5,100,NaN])assert.equal(quoteOffer(base(),{...context,quantity}).total,null);
 for(const patch of [{unitPrice:1.5},{unitPrice:-1},{stock:undefined},{unitPrice:Number.MAX_SAFE_INTEGER}])assert.equal(quoteOffer({...base(),...patch},{...context,quantity:2}).total,null);
});
test('잘못된 할인율·중복 ID·과도한 쿠폰 집합은 명시적으로 미확인',()=>{
 for(const coupons of [[coupon({type:'percent',value:10001})],[coupon(),coupon()],Array.from({length:13},(_,i)=>coupon({id:String(i)}))])assert.equal(quoteOffer({...base(),coupons},context).status,'unknown');
});
test('무료배송을 놓친 다수 쿠폰보다 작은 할인 조합이 유리',()=>{
 const o={...base(),unitPrice:6000,coupons:[coupon({id:'big',value:1500}),coupon({id:'small',value:1000})]};const q=quoteOffer(o,context);assert.equal(q.total,5000);assert.equal(q.applied[0].id,'small');
});
test('데모 순위: 1개 B, 2개 D, 3개 C 및 미승인 숨김',()=>{
 const offers=demoOffers(now);
 for(const [quantity,id,total] of [[1,'b',2800],[2,'d',5000],[3,'c',5200]]){
  const results=compareOffers(offers,{...context,variant:demoProduct.variant,quantity});assert.equal(results[0].offer.id,id);assert.equal(results[0].total,total);assert.equal(results.some(q=>q.offer.id==='hidden'),false);
 }
});
test('데모 수량·지역·혜택의 모든 조합에서 금액 내역 합계 보존',()=>{
 for(let quantity=1;quantity<=9;quantity++)for(const region of ['metro','regional'])for(const member of [false,true])for(const firstOrder of [false,true]){
  const q=compareOffers(demoOffers(now),{...context,quantity,region,member,firstOrder,variant:demoProduct.variant});let last=-1;
  for(const row of q.filter(q=>q.total!==null)){assert.ok(Number.isSafeInteger(row.total));assert.equal(row.total,row.gross-row.quantityDiscount-row.couponDiscount+row.shipping);assert.ok(row.total>=last);last=row.total;}
 }
});
