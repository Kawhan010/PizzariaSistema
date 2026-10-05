// Transcrição do cardápio fornecido pelo proprietário em seis imagens.
// Todos os preços são armazenados em centavos; as imagens originais ficam em assets/cardapio.
export const SIZES = {
  small: { label: 'Pequena', slices: 4 },
  medium: { label: 'Média', slices: 6 },
  large: { label: 'Grande', slices: 8 },
  family: { label: 'Família', slices: 10 },
  giant: { label: 'Gigante', slices: 12 }
};
export const GROUPS = {
  traditional: 'Tradicionais', special: 'Especiais', sweet: 'Doces', discoveries: 'Descobertas',
  water: 'Águas', juice: 'Sucos', soda: 'Refrigerantes', wine: 'Vinhos', beer: 'Cervejas',
  energy: 'Energéticos', spirits: 'Doses', cocktail: 'Coquetéis'
};
export const SOURCES = [
  { label: 'Bebidas', image: 'assets/cardapio/bebidas.png' },
  { label: 'Coquetéis', image: 'assets/cardapio/coqueteis.png' },
  { label: 'Pizzas doces e especiais', image: 'assets/cardapio/pizzas-doces-especiais.png' },
  { label: 'Pizzas · página 1', image: 'assets/cardapio/pizzas-1.png' },
  { label: 'Pizzas · página 2', image: 'assets/cardapio/pizzas-2.png' },
  { label: 'Pizzas · página 3', image: 'assets/cardapio/pizzas-3.png' }
];
const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const standard = [55, 65, 75, 85, 95];
const lower = [55, 60, 70, 80, 90];
const vegetarian = [50, 60, 70, 80, 90];
const special = [40, 50, 60, 70, 80];

function pizza(name, description, group = 'traditional', values = standard, source = 3) {
  return { id: `pizza-${slug(name)}`, kind: 'pizza', group, name, description, source,
    prices: Object.fromEntries(Object.keys(SIZES).map((size, index) => [size, values[index] * 100])) };
}
function drink(name, group, options, description = '', kind = 'drink', source = 0) {
  return { id: `${kind}-${group}-${slug(name)}`, kind, group, name, description, source,
    variants: options.map(([label, price], index) => ({ id: `v${index}`, label, price: price * 100 })) };
}
function cocktail(name, price, description, alcohol = 'standard') {
  const variants = alcohol === 'optional' ? [['Com álcool', price], ['Sem álcool', price]] : [[alcohol === 'none' ? 'Sem álcool' : 'Unidade', price]];
  return drink(name, 'cocktail', variants, description, 'cocktail', 1);
}

export const catalog = [
  // Pizzas doces e especiais: imagem 3.
  pizza('Banana com canela', 'Muçarela, banana, canela e açúcar.', 'sweet', standard, 2),
  pizza('Banana com chocolate', 'Muçarela, banana e chocolate ao leite.', 'sweet', standard, 2),
  pizza('Banana com leite condensado', 'Muçarela, banana, leite condensado e canela.', 'sweet', standard, 2),
  pizza('Banana crocante', 'Muçarela, banana, creme de avelã e castanha.', 'sweet', standard, 2),
  pizza('Chocolate', 'Muçarela e chocolate ao leite.', 'sweet', standard, 2),
  pizza('Chocolate com morango', 'Muçarela, chocolate ao leite e morango.', 'sweet', standard, 2),
  pizza('Romeu e Julieta', 'Muçarela e goiabada.', 'sweet', standard, 2),
  pizza('Sensação', 'Muçarela, chocolate, morango e leite condensado.', 'sweet', standard, 2),
  pizza('Prestígio', 'Muçarela, chocolate, coco ralado, cereja e leite condensado.', 'sweet', standard, 2),
  pizza('Morango nevado', 'Muçarela, chocolate branco, castanha, morango, leite condensado, coco ralado e creme de leite.', 'sweet', standard, 2),
  pizza("M&M’s", 'Muçarela, chocolate ao leite, leite condensado e M&M’s.', 'sweet', standard, 2),
  pizza('Sensacional', 'Muçarela, chocolate branco e preto ao leite, cereja e leite condensado.', 'sweet', standard, 2),
  pizza('Portuguesa especial', 'Molho, muçarela, tomate, calabresa, cebola, pimentão, azeitona e orégano.', 'special', special, 2),
  pizza('Calabresa à la moda', 'Molho, muçarela, calabresa, cebola, tomate, milho, ervilha, azeitona e orégano.', 'special', special, 2),
  pizza('Frango caipira', 'Molho, muçarela, frango, catupiry, milho, ervilha, ovo, azeitona e orégano.', 'special', special, 2),
  pizza('Preciosa', 'Molho, muçarela, lombinho, catupiry, bacon, azeitona e orégano.', 'special', special, 2),
  pizza('Lampião', 'Molho, muçarela, charque, cebola, azeitona e orégano.', 'special', special, 2),

  // Pizzas: imagem 4.
  pizza('Extravaganza', 'Molho, muçarela, carne moída, presunto, pimentão, calabresa, champignon, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Portuguesa', 'Molho, muçarela, frango, presunto, calabresa, ovo, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Mista', 'Molho, muçarela, frango, presunto, calabresa, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Frango', 'Molho, muçarela, frango, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Frango ao catupiry', 'Molho, muçarela, frango, catupiry, orégano e azeitona.'),
  pizza('Frango ao cheddar', 'Molho, muçarela, frango, cheddar, orégano e azeitona.'),
  pizza('Calabresa especial', 'Molho, muçarela, calabresa, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Calabresa ao catupiry', 'Molho, muçarela, calabresa, catupiry, palmito, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Calabresa ao cheddar', 'Molho, muçarela, calabresa, cheddar, palmito, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Milho verde', 'Molho, muçarela, milho verde, orégano e azeitona.'),
  pizza('Milho verde ao catupiry', 'Molho, muçarela, milho verde, catupiry, orégano e azeitona.'),
  pizza('Milho verde ao cheddar', 'Molho, muçarela, milho verde, cheddar, orégano e azeitona.'),
  pizza('@.com', 'Molho, muçarela, catupiry, presunto, lombinho canadense, frango, palmito, ovo, tomate, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Italiana', 'Molho, muçarela, presunto, frango, lombinho canadense, palmito, pimentão, milho, ervilha, cebola, orégano e azeitona.'),
  pizza('Camarão ao catupiry', 'Molho, muçarela, catupiry, camarão, orégano e azeitona.'),
  pizza('Camarão ao cheddar', 'Molho, muçarela, cheddar, camarão, orégano e azeitona.'),
  pizza('Camarão', 'Molho, muçarela, camarão, orégano e azeitona.'),

  // Pizzas: imagem 5. Atum e vegetariana têm tabelas de preços próprias.
  pizza('Atum', 'Molho, atum, milho, ervilha, tomate, cebola, muçarela, azeitona e orégano.', 'traditional', lower, 4),
  pizza('Atum ao catupiry', 'Molho, atum, catupiry, muçarela, azeitona e orégano.', 'traditional', lower, 4),
  pizza('Atum ao cheddar', 'Molho, muçarela, atum, cheddar, orégano e azeitona.', 'traditional', lower, 4),
  pizza('Jardineira', 'Molho, muçarela, atum, catupiry, tomate, palmito, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Brasileira', 'Molho, muçarela, calabresa, catupiry, tomate, milho, ervilha, cebola, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Paulista', 'Molho, muçarela, catupiry, lombinho canadense, provolone, tomate, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Lombinho ao catupiry', 'Molho, muçarela, catupiry, lombinho canadense, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Provolone', 'Molho, muçarela, tomate, provolone, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Dois queijos', 'Molho, muçarela, catupiry, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Três queijos', 'Molho, muçarela, provolone, catupiry, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Quatro queijos', 'Molho, muçarela, provolone, parmesão, catupiry, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Quatro estações', '1/4 portuguesa, 1/4 calabresa, 1/4 frango com catupiry e 1/4 muçarela. Receita fixa do cardápio.', 'traditional', standard, 4),
  pizza('Tropical', 'Molho, muçarela, lombinho canadense, abacaxi, passas, catupiry, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Premiata', 'Molho, muçarela, frango, catupiry, calabresa, tomate, milho, ervilha, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Predilecta', 'Molho, muçarela, catupiry, presunto, calabresa, palmito, cebola, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Margherita', 'Molho, muçarela, tomate, manjericão, orégano e azeitona.', 'traditional', standard, 4),
  pizza('Vegetariana', 'Molho, muçarela, milho, ervilha, palmito, tomate, cebola, orégano e azeitona.', 'traditional', vegetarian, 4),

  // Pizzas e descobertas: imagem 6.
  pizza('Toscana', 'Molho, muçarela, calabresa moída, milho, ervilha, tomate, cebola, azeitona e orégano.', 'traditional', lower, 5),
  pizza('Napolitana', 'Molho, muçarela, calabresa, presunto moído, palmito, cebola, azeitona e orégano.', 'traditional', lower, 5),
  pizza('Namorado', 'Molho, muçarela, catupiry, bacon, tomate, palmito, milho, ervilha, cebola, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Cubana', 'Molho, muçarela, frango, milho, ervilha, cebola, palmito, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Nordestina', 'Molho, muçarela, catupiry, charque, cebola, tomate, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Sertaneja', 'Molho, muçarela, charque, cebola, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Gaúcha', 'Molho, muçarela, charque, milho, ervilha, palmito, cebola, orégano e azeitona.', 'traditional', standard, 5),
  pizza('A tal da pizza', 'Molho, muçarela, presunto, frango, bacon, catupiry, azeitona, tomate, palmito, ovo, milho, ervilha e orégano.', 'traditional', standard, 5),
  pizza('Fiesta', 'Molho, muçarela, lombinho canadense, tomate, provolone, catupiry, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Carne seca', 'Molho, muçarela, carne seca, pimentão, cebola, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Carne seca com banana da terra', 'Molho, muçarela, carne seca, pimentão, banana da terra, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Baiana', 'Molho, muçarela, calabresa moída, cebola, ovos, pimenta calabresa, bacon, palmito, pimentão, tomate, milho, ervilha, orégano e azeitona.', 'traditional', standard, 5),
  pizza('Bacon', 'Molho, muçarela, bacon, cebola, orégano e azeitona.', 'discoveries', standard, 5),
  pizza("Domino’s", 'Molho, muçarela, presunto moído, bacon, tomate, cebola, orégano e azeitona.', 'discoveries', standard, 5),
  pizza('Calabresa tradicional', 'Molho, muçarela, calabresa, cebola roxa, orégano e azeitona.', 'discoveries', standard, 5),
  pizza('Matuto', 'Molho, muçarela, carne moída, carne seca, catupiry, pimentão, cebola, orégano e azeitona.', 'discoveries', standard, 5),

  // Águas.
  drink('Água com gás', 'water', [['Unidade', 4]]),
  drink('Água sem gás', 'water', [['Unidade', 4]]),
  drink('Água de coco', 'water', [['Copo', 7]]),
  drink('H2O', 'water', [['Unidade', 10]]),
  drink('H2O Limoneto', 'water', [['Unidade', 10]]),

  // A tabela de jarras aplica-se aos quinze sabores de suco.
  ...['Maracujá', 'Morango', 'Graviola', 'Limão', 'Cajá', 'Goiaba', 'Laranja', 'Ameixa', 'Uva', 'Manga', 'Cacau', 'Abacaxi', 'Mangaba', 'Acerola', 'Açaí'].map(flavor =>
    drink(`Suco de ${flavor.toLowerCase()}`, 'juice', [['Individual', 8], ['Jarra · 2 copos', 15], ['Jarra · 5 copos', 35], ['Jarra · 7 copos', 45]])
  ),

  // Volumes cadastrados apenas quando aparecem na respectiva coluna da imagem.
  drink('Coca-Cola', 'soda', [['Lata', 8], ['1 litro', 13], ['2 litros', 15]]),
  drink('Coca-Cola Zero', 'soda', [['Lata', 8], ['1 litro', 13]]),
  drink('Guaraná', 'soda', [['Lata', 8], ['1 litro', 13], ['2 litros', 15]]),
  drink('Guaraná Zero', 'soda', [['Lata', 8], ['1 litro', 13]]),
  drink('Sprite', 'soda', [['Lata', 8], ['1 litro', 13], ['2 litros', 15]]),
  drink('Fanta uva', 'soda', [['Lata', 8]]),
  drink('Fanta', 'soda', [['Lata', 8], ['1 litro', 13], ['2 litros', 15]]),
  drink('Schweppes', 'soda', [['Lata', 8]]),
  drink('Soda limonada', 'soda', [['Lata', 8], ['1 litro', 13], ['2 litros', 15]]),

  drink('Pérgola', 'wine', [['1 litro', 45], ['750 ml', 35]]),
  drink('Vinho na taça', 'wine', [['Taça', 15]]),
  drink('Canção', 'wine', [['1 litro', 45]]),
  drink('Quinta do Morgado', 'wine', [['1 litro', 45], ['750 ml', 38]]),
  drink('Quinta do Rio Grande', 'wine', [['Unidade', 45]], 'Volume não especificado no cardápio.'),

  drink('Heineken', 'beer', [['Unidade', 13]]),
  drink('Skol litrinho', 'beer', [['Unidade', 7]]),
  drink('Budweiser', 'beer', [['Unidade', 11]]),
  drink('Budweiser sem álcool', 'beer', [['Unidade', 11]]),
  drink('Ice Smirnoff', 'beer', [['Unidade', 16]]),
  drink('Skol Beats', 'beer', [['Unidade', 16]]),

  drink('RedBull Energético', 'energy', ['Tradicional', 'Sem açúcar', 'Açaí', 'Tropical', 'Coco', 'Melancia'].map(flavor => [flavor, 18])),
  drink('Monster Energético', 'energy', ['Tradicional', 'Manga', 'Laranja', 'Melancia', 'Uva cítrica', 'Kiwi com maçã verde', 'Energy Zero Ultra'].map(flavor => [flavor, 18])),

  ...[
    ['Black & White', 13], ['White Horse', 15], ['Passaport', 15], ['Chivas Regal 12 anos', 20],
    ['Red Lambel', 18], ['Black Lambel', 18], ["Jack Daniel’s", 20], ['Jamerson', 18], ["Teacher’s", 15],
    ['Vodka Smirnoff', 10], ['Jennesse Fire', 18], ['Wall Street', 13], ['Montilla', 12], ['Bacardi', 12],
    ['Campari', 13], ['Martini', 13], ['STO Remy', 13], ['Gim', 13], ['Ballantines', 15], ['Old Par', 20],
    ['Old Eight', 12], ['Natu Nobilis', 12], ['J&B 8 anos', 15]
  ].map(([name, price]) => drink(name, 'spirits', [['Dose', price]])),

  // Coquetéis: nomes, ingredientes e opções de álcool conforme a imagem 2.
  cocktail('Alexander', 25, 'Conhaque, creme de cacau, creme de leite, gelo, açúcar e canela.'),
  cocktail('Nevada', 15, 'Vodka, limão, leite condensado e gelo.', 'optional'),
  cocktail('Spritzer', 25, 'Vinho branco, limão, soda e gelo.'),
  cocktail('Pôr-do-Sol', 30, 'Campary, vodka, suco de laranja, açúcar e gelo.'),
  cocktail('Espanhola de morango', 30, 'Morango, leite condensado, vinho e gelo.'),
  cocktail('Espanhola de maracujá', 30, 'Maracujá, leite condensado, vodka e vinho.'),
  cocktail('Monster gim', 30, 'Hortelã, laranja, maracujá, gim, energético Juice Monster e gelo.'),
  cocktail('Alexander sister', 30, 'Conhaque, creme de cacau, creme de menta, creme de leite, açúcar e gelo.'),
  cocktail('Lagoa azul', 25, 'Limão, vodka, curaçau blue, soda e gelo.'),
  cocktail('Rose Lady', 25, 'Gim, groselha, creme de leite, açúcar e gelo.'),
  cocktail('Lagoinha', 30, 'Vodka, ice de limão, curaçau blue e gelo.'),
  cocktail('Camparinha', 25, 'Limão, Campary, açúcar e gelo.'),
  cocktail('Caruso', 25, 'Gim, Martini Dri, creme de menta e gelo.'),
  cocktail('Ilha tropical', 30, 'Vodka, abacaxi, curaçau blue, soda e gelo.'),
  cocktail('Paradise', 30, 'Xarope de groselha, suco de laranja, suco de abacaxi, Bacardi, Malibu, curaçau blue e gelo.'),
  cocktail('Surpresa em Domino’s', 25, 'Montilla, suco de laranja, curaçau blue e granadine.'),
  cocktail('Mojito', 25, 'Bacardi, suco de limão, açúcar, hortelã e água com gás.'),
  cocktail('Rum Sensação', 25, 'Leite condensado, leite, licor de cacau, calda de chocolate, Bacardi e gelo.'),
  cocktail('Fusca Azul', 20, 'Powerade, leite condensado, Fanta uva e gelo.', 'none'),
  cocktail('Mulata Quente', 25, 'Leite condensado, creme de chocolate, Montilla e gelo.'),
  cocktail('Campary soda', 25, 'Campary, soda limonada, laranja e gelo.'),
  cocktail('Aperol spritz', 30, 'Aperol, laranja, espumante e água com gás.'),
  cocktail('Smirnoff cream morango', 30, 'Morango, leite condensado, Ice Smirnoff e gelo.'),
  cocktail('Bitter rickey', 30, 'Limão, gim, Campary, soda e gelo.'),
  cocktail('Gim de pitaya', 30, 'Gim, pitaya, soda e gelo.'),
  cocktail('Lagoa vermelha', 25, 'Limão, curaçau red, vodka e soda.'),
  cocktail('Chave de fenda', 25, 'Vodka, groselha, suco de laranja e gelo.', 'optional'),
  cocktail('Coquetel de frutas', 30, 'Sucos de laranja, uva, abacaxi, maracujá e caju; vodka, creme de leite, groselha, açúcar e gelo.', 'optional'),
  cocktail('Caipifruta de morango', 25, 'Morango, leite condensado, vodka, açúcar e gelo.', 'optional')
];

export function quotePizza(ids, size, products = catalog) {
  if (!SIZES[size] || !Array.isArray(ids) || ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length) {
    throw new Error('Escolha um tamanho e até dois sabores diferentes.');
  }
  const flavors = ids.map(id => products.find(product => product.id === id && product.kind === 'pizza' && product.available !== false));
  if (flavors.some(flavor => !flavor)) throw new Error('Sabor não encontrado no cardápio.');
  return {
    key: `${[...ids].sort().join('+')}:${size}`, productIds: [...ids], size,
    name: flavors.length === 1 ? flavors[0].name : flavors.map(flavor => `½ ${flavor.name}`).join(' + '),
    variant: `${SIZES[size].label} · ${SIZES[size].slices} fatias`,
    unitPrice: Math.max(...flavors.map(flavor => flavor.prices[size]))
  };
}

export function quoteProduct(id, variantId, products = catalog) {
  const product = products.find(item => item.id === id && item.kind !== 'pizza' && item.available !== false);
  const variant = product?.variants.find(item => item.id === variantId);
  if (!variant) throw new Error('Escolha uma opção válida do cardápio.');
  return { key: `${id}:${variantId}`, productIds: [id], variantId, name: product.name, variant: variant.label, unitPrice: variant.price };
}
