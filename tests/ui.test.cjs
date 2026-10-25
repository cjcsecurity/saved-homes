const test = require('node:test');
const assert = require('node:assert/strict');
const { selectHomes, formatNumber, formatPrice, formatDate, listingUrl, cardLabel } = require('../public/app.js');

const homes = [
  { id: 'a', address: '10 Pine Road, Colorado Springs, CO 80908', city: 'Colorado Springs', zipcode: '80908', price: 700000, sqft: 3000, lotSqft: 43560 },
  { id: 'b', address: '20 Aspen Lane, Palmer Lake, CO 80133', city: 'Palmer Lake', zipcode: '80133', price: 600000, sqft: 3200, lotSqft: 9000 },
  { id: 'c', address: '30 Cañon Road, Colorado Springs, CO 80908', city: 'Colorado Springs', zipcode: '80908', price: null, sqft: 2500, lotSqft: 217800 },
];
const ids = values => values.map(home => home.id);

test('default preserves saved order and does not mutate the original list', () => {
  assert.deepEqual(ids(selectHomes(homes)), ['a', 'b', 'c']);
  selectHomes(homes, { sort: 'price-asc' });
  assert.deepEqual(ids(homes), ['a', 'b', 'c']);
});
test('address search handles words, case, whitespace and accents', () => {
  assert.deepEqual(ids(selectHomes(homes, { query: '  CANON   80908 ' })), ['c']);
  assert.deepEqual(ids(selectHomes(homes, { query: 'pine springs' })), ['a']);
});
test('city and text filters combine, including an empty result', () => {
  assert.deepEqual(ids(selectHomes(homes, { city: 'Colorado Springs' })), ['a', 'c']);
  assert.deepEqual(selectHomes(homes, { city: 'Palmer Lake', query: 'pine' }), []);
});
test('numeric sorts put missing values last and sort acreage by numeric square feet', () => {
  assert.deepEqual(ids(selectHomes(homes, { sort: 'price-asc' })), ['b', 'a', 'c']);
  assert.deepEqual(ids(selectHomes(homes, { sort: 'price-desc' })), ['a', 'b', 'c']);
  assert.deepEqual(ids(selectHomes(homes, { sort: 'lot-desc' })), ['c', 'a', 'b']);
  assert.deepEqual(ids(selectHomes(homes, { sort: 'sqft-desc' })), ['b', 'a', 'c']);
});
test('unknown sorting preserves order and price ties are stable', () => {
  assert.deepEqual(ids(selectHomes(homes, { sort: 'bad-value' })), ['a', 'b', 'c']);
  const tied = homes.map(home => ({ ...home, price: 1 }));
  assert.deepEqual(ids(selectHomes(tied, { sort: 'price-asc' })), ['a', 'b', 'c']);
});
test('formatting preserves fractional bathrooms and handles missing values', () => {
  assert.equal(formatNumber(2.5), '2.5');
  assert.equal(formatNumber(2704), '2,704');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatPrice(665000), '$665,000');
  assert.equal(formatPrice(665000, true), '$665K');
  assert.equal(formatPrice(undefined), 'Price unavailable');
  assert.equal(formatDate('2026-10-25'), 'Oct 25, 2026');
  assert.equal(formatDate(undefined), '');
});
test('listing URLs only accept HTTPS Zillow detail pages', () => {
  assert.equal(listingUrl('https://www.zillow.com/homedetails/13558158_zpid/'), 'https://www.zillow.com/homedetails/13558158_zpid/');
  for (const value of ['javascript:alert(1)', 'http://www.zillow.com/homedetails/1/', 'https://zillow.com.evil.example/homedetails/1/', 'https://www.zillow.com/myzillow/', null]) {
    assert.equal(listingUrl(value), null);
  }
});

test('the accessible full-card name includes every listing fact and new-tab behavior', () => {
  assert.equal(cardLabel({ address: '4465 Leprechaun Ln, Colorado Springs, CO 80908', price: 665000, beds: 4, baths: 3, sqft: 2576, lotLabel: '5 acres' }),
    '4465 Leprechaun Ln, Colorado Springs, CO 80908. $665,000. 4 bedrooms, 3 bathrooms, 2,576 square feet. 5 acres lot. View listing on Zillow (opens in a new tab).');
});
