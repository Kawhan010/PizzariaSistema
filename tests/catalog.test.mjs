import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, SIZES, quotePizza, quoteProduct } from '../catalog.js';

test('as seis páginas foram cadastradas sem produtos duplicados', () => {
  assert.equal(catalog.length, 161);
  assert.equal(new Set(catalog.map(product => product.id)).size, 161);
  assert.deepEqual(['pizza', 'drink', 'cocktail'].map(kind => catalog.filter(product => product.kind === kind).length), [67, 65, 29]);
  for (const product of catalog) {
    const prices = product.kind === 'pizza' ? Object.values(product.prices) : product.variants.map(variant => variant.price);
    assert.ok(prices.length && prices.every(price => Number.isSafeInteger(price) && price > 0), product.name);
  }
});

test('tamanhos e tabelas de preços distintas permanecem como no cardápio', () => {
  assert.deepEqual(Object.values(SIZES).map(size => size.slices), [4, 6, 8, 10, 12]);
  assert.equal(quotePizza(['pizza-margherita'], 'large').unitPrice, 7500);
  assert.equal(quotePizza(['pizza-atum'], 'large').unitPrice, 7000);
  assert.equal(quotePizza(['pizza-vegetariana'], 'small').unitPrice, 5000);
  assert.equal(quotePizza(['pizza-lampiao'], 'small').unitPrice, 4000);
  assert.equal(quotePizza(['pizza-lampiao'], 'giant').unitPrice, 8000);
});

test('pizza com dois sabores cobra o valor maior, sem somar ou tirar a média', () => {
  const quote = quotePizza(['pizza-lampiao', 'pizza-margherita'], 'large');
  assert.equal(quote.unitPrice, 7500);
  assert.equal(quote.productIds.length, 2);
  assert.equal(quote.variant, 'Grande · 8 fatias');
  assert.equal(quotePizza(['pizza-margherita', 'pizza-lampiao'], 'large').key, quote.key);
  assert.equal(quotePizza(['pizza-vegetariana', 'pizza-portuguesa-especial'], 'small').unitPrice, 5000);
});

test('não permite terceiro sabor, bebida como sabor ou tamanho inválido', () => {
  assert.throws(() => quotePizza(['pizza-margherita', 'pizza-lampiao', 'pizza-atum'], 'large'));
  assert.throws(() => quotePizza(['drink-water-agua-com-gas'], 'large'));
  assert.throws(() => quotePizza(['pizza-margherita'], 'unknown'));
  assert.throws(() => quotePizza(['pizza-margherita', 'pizza-margherita'], 'large'));
});

test('bebidas respeitam volumes e preços das respectivas colunas', () => {
  assert.equal(quoteProduct('drink-soda-coca-cola', 'v2').unitPrice, 1500);
  assert.equal(quoteProduct('drink-juice-suco-de-maracuja', 'v3').unitPrice, 4500);
  assert.equal(quoteProduct('drink-wine-quinta-do-morgado', 'v1').unitPrice, 3800);
  assert.throws(() => quoteProduct('drink-soda-coca-cola-zero', 'v2'));
});

test('coquetéis com e sem álcool mantêm as opções e valores fornecidos', () => {
  assert.equal(quoteProduct('cocktail-cocktail-fusca-azul', 'v0').unitPrice, 2000);
  assert.equal(quoteProduct('cocktail-cocktail-fusca-azul', 'v0').variant, 'Sem álcool');
  assert.equal(quoteProduct('cocktail-cocktail-nevada', 'v1').variant, 'Sem álcool');
  assert.equal(quoteProduct('cocktail-cocktail-nevada', 'v1').unitPrice, 1500);
});
