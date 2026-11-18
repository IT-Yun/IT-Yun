import { analyzeFunctions } from './functionAnalyzer.mjs';

const files = new Map([
  ['cart.js', 'export function calculateTotal(price, quantity) { return price * quantity; }'],
  ['display.js', 'export function showPrice(cents) { return String(cents / 100); }']
]);
const analysis = analyzeFunctions(files);
console.log(JSON.stringify(analysis, null, 2));
