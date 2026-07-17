/* eslint-disable no-console */
/**
 * Bulk seed: generates ~10,000 realistic products spread across all sellers + categories.
 *
 * Run with:  pnpm db:seed:bulk
 *
 * Idempotent-ish: uses a `bulk-` prefix on slugs so re-running won't collide with
 * the demo seed. Re-running this script will skip products whose slug already exists.
 */
import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_PRODUCTS = Number(process.env.BULK_COUNT ?? 10_000);
const BATCH = 500;

// ---- Catalog templates ----

/** Keep in sync with CAT_SPECS in seed.ts — every slug here must exist there. */
type CategorySlug =
  | 'footwear'
  | 'electronics'
  | 'home-kitchen'
  | 'fashion'
  | 'beauty'
  | 'sports-fitness'
  | 'books-stationery'
  | 'toys-games'
  | 'furniture'
  | 'grocery-gourmet'
  | 'watches-accessories'
  | 'pet-supplies';

interface CatalogSpec {
  category: CategorySlug;
  brands: string[];
  types: string[];
  adjectives: string[];
  attrKey?: 'size' | 'color' | 'capacity' | 'material' | 'flavour' | 'age';
  attrValues?: string[];
  colors?: string[];
  priceRange: [number, number]; // [low, high] for listPrice
  marginPct: [number, number];  // [low, high] for (list - min) / list
  imageSeeds: string[];         // unsplash photo IDs — verified to return 200
}

const CATALOGS: CatalogSpec[] = [
  {
    category: 'footwear',
    brands: ['Stride', 'Pace', 'TrailX', 'Kicks Co.', 'Sole', 'Dash', 'Velvet', 'Aero', 'Bolt', 'Drift'],
    types: ['Running Shoes', 'Sneakers', 'Hiking Boots', 'Slip-Ons', 'Loafers', 'Trainers', 'Sandals', 'Flip Flops', 'Casual Shoes', 'Sports Shoes'],
    adjectives: ['Lightweight', 'All-Terrain', 'Premium', 'Daily', 'Pro', 'Classic', 'Urban', 'Ultra', 'Eco', 'Comfort'],
    attrKey: 'size',
    attrValues: ['7', '8', '9', '10', '11'],
    colors: ['Black', 'White', 'Grey', 'Navy', 'Brown', 'Tan', 'Olive', 'Maroon'],
    priceRange: [799, 9999],
    marginPct: [0.25, 0.5],
    imageSeeds: [
      'photo-1542291026-7eec264c27ff',
      'photo-1600185365483-26d7a4cc7519',
      'photo-1520975916090-3105956dac38',
      'photo-1525966222134-fcfa99b8ae77',
      'photo-1460353581641-37baddab0fa2',
      'photo-1551107696-a4b0c5a0d9a2',
    ],
  },
  {
    category: 'electronics',
    brands: ['Volt', 'Nimbus', 'Zenith', 'Pixel', 'Sonix', 'Quark', 'Hertz', 'NovaTek', 'Lumix', 'Ampere'],
    types: ['Wireless Earbuds', 'Bluetooth Speaker', 'Smart Watch', 'Power Bank', 'USB-C Charger', 'Mechanical Keyboard', 'Gaming Mouse', 'HD Webcam', 'Wireless Mouse', 'Laptop Stand', 'Monitor', 'Wired Headphones', 'Tablet Stylus', 'Phone Holder'],
    adjectives: ['Pro', 'Mini', 'Max', 'Air', 'Ultra', 'Lite', 'Studio', 'Plus', '2024 Edition', 'Premium'],
    attrKey: 'color',
    attrValues: ['Black', 'White', 'Silver', 'Space Grey'],
    priceRange: [499, 49999],
    marginPct: [0.2, 0.4],
    imageSeeds: [
      'photo-1498049794561-7780e7231661',
      'photo-1583394838336-acd977736f90',
      'photo-1546435770-a3e426bf472b',
      'photo-1572569511254-d8f925fe2cbb',
      'photo-1511707171634-5f897ff02aa9',
      'photo-1593642632559-0c6d3fc62b89',
      'photo-1518770660439-4636190af475',
    ],
  },
  {
    category: 'home-kitchen',
    brands: ['Hearth', 'Casa', 'Kindred', 'Nest', 'Atelier', 'Saaj', 'Mela', 'Tava', 'Otto', 'Linea'],
    types: ['Ceramic Dinner Set', 'Bedsheet Set', 'Cotton Curtains', 'Bath Towels', 'Cushion Covers', 'Wall Clock', 'Table Lamp', 'Storage Boxes', 'Organic Pillow', 'Bamboo Cutlery', 'Wooden Tray', 'Coffee Mug Set', 'Stainless Cookware', 'Air Purifier'],
    adjectives: ['Artisan', 'Hand-Crafted', 'Modern', 'Vintage', 'Eco', 'Premium', 'Minimalist', 'Heritage', 'Designer', 'Cosy'],
    attrKey: 'color',
    attrValues: ['Ivory', 'Slate', 'Terracotta', 'Forest', 'Charcoal'],
    priceRange: [299, 19999],
    marginPct: [0.3, 0.5],
    imageSeeds: [
      'photo-1556909114-f6e7ad7d3136',
      'photo-1585338447937-7082f8fc763d',
      'photo-1567016432779-094069958ea5',
      'photo-1493663284031-b7e3aefcae8e',
      'photo-1583847268964-b28dc8f51f92',
    ],
  },
  {
    category: 'fashion',
    brands: ['Khadi Co.', 'Verve', 'Indigo', 'Cotton & Co', 'Saanjh', 'Wovn', 'Kaveri', 'Loom', 'Aria', 'Mira'],
    types: ['Cotton Kurta', 'Linen Shirt', 'Denim Jacket', 'Pure Silk Saree', 'Casual Tee', 'Slim Fit Jeans', 'Anarkali Suit', 'Hoodie', 'Block Print Dress', 'Wrap Skirt', 'Embroidered Top', 'Chinos', 'Blazer'],
    adjectives: ['Handloom', 'Festive', 'Everyday', 'Pastel', 'Monsoon', 'Resort', 'Office', 'Indo-Western', 'Premium', 'Limited Edition'],
    attrKey: 'size',
    attrValues: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Indigo', 'Mustard', 'Ivory', 'Olive', 'Wine', 'Black', 'Powder Blue'],
    priceRange: [499, 8999],
    marginPct: [0.35, 0.55],
    imageSeeds: [
      'photo-1495121605193-b116b5b9c5fe',
      'photo-1490481651871-ab68de25d43d',
      'photo-1520006403909-838d6b92c22e',
      'photo-1485231183945-fffde7cc051e',
      'photo-1539109136881-3be0616acf4b',
    ],
  },
  {
    category: 'beauty',
    brands: ['Glow', 'Rooted', 'Pure', 'Dewdrop', 'Botani', 'Vana', 'Aurelia', 'Ojas', 'Hue', 'Bloom'],
    types: ['Vitamin C Serum', 'Hydrating Moisturiser', 'Lip & Cheek Tint', 'Niacinamide Serum', 'Sunscreen SPF 50', 'Hair Oil', 'Face Wash', 'Kajal Pencil', 'Body Lotion', 'Hair Mask', 'Face Mist', 'Foot Cream'],
    adjectives: ['Ayurvedic', 'Natural', 'Vegan', 'Probiotic', 'Glowing', 'Brightening', 'Soothing', 'Radiance', 'Nourishing', 'Daily'],
    attrKey: 'capacity',
    attrValues: ['30ml', '50ml', '100ml', '200ml'],
    priceRange: [199, 2999],
    marginPct: [0.4, 0.6],
    imageSeeds: [
      'photo-1571781926291-c477ebfd024b',
      'photo-1556228720-195a672e8a03',
      'photo-1522335789203-aabd1fc54bc9',
      'photo-1612817288484-6f916006741a',
      'photo-1596462502278-27bfdc403348',
    ],
  },
  {
    category: 'sports-fitness',
    brands: ['Vayu', 'Prana', 'IronOak', 'Summit', 'Tempo', 'Grit', 'Zeal', 'Apex', 'Terra', 'Pulse'],
    types: [
      'Insulated Water Bottle', 'Vacuum Flask', 'Yoga Mat', 'Adjustable Dumbbell', 'Resistance Band Set',
      'Hiking Backpack', 'Skipping Rope', 'Foam Roller', 'Cricket Bat', 'Badminton Racquet',
      'Football', 'Gym Gloves', 'Trekking Poles', 'Sports Duffel Bag',
    ],
    adjectives: ['Pro', 'Lightweight', 'All-Weather', 'Everyday', 'Trail', 'Studio', 'Heavy-Duty', 'Compact', 'Eco', 'Performance'],
    attrKey: 'capacity',
    attrValues: ['500ml', '750ml', '1L', 'Standard', 'Large'],
    colors: ['Black', 'Steel', 'Forest', 'Sunset', 'Navy'],
    priceRange: [299, 14999],
    marginPct: [0.3, 0.5],
    imageSeeds: [
      'photo-1517836357463-d25dfeac3438',
      'photo-1571019613454-1cb2f99b2d8b',
      'photo-1553062407-98eeb64c6a62',
      'photo-1523362628745-0c100150b504',
      'photo-1461896836934-ffe607ba8211',
    ],
  },
  {
    category: 'books-stationery',
    brands: ['Inkwell', 'Margin', 'Paper Co.', 'Quill', 'Folio', 'Scribe', 'Leaf', 'Athenaeum', 'Nib', 'Verso'],
    types: [
      'Hardcover Notebook', 'Fountain Pen', 'Sketchbook', 'Desk Planner', 'Gel Pen Set',
      'Bullet Journal', 'Watercolour Set', 'Leather Diary', 'Sticky Note Pack', 'Book Stand',
      'Highlighter Set', 'Calligraphy Kit',
    ],
    adjectives: ['Classic', 'Dotted', 'Ruled', 'Vintage', 'Minimalist', 'Handbound', 'Premium', 'Everyday', 'Artist', 'Limited Edition'],
    attrKey: 'size',
    attrValues: ['A4', 'A5', 'A6', 'Pocket'],
    colors: ['Kraft', 'Midnight', 'Sage', 'Burgundy', 'Ivory'],
    priceRange: [99, 3999],
    marginPct: [0.35, 0.55],
    imageSeeds: [
      'photo-1512820790803-83ca734da794',
      'photo-1544947950-fa07a98d237f',
      'photo-1481627834876-b7833e8f5570',
      'photo-1524995997946-a1c2e315a42f',
    ],
  },
  {
    category: 'toys-games',
    brands: ['Tinker', 'Playloop', 'Cubby', 'Whimsy', 'BrickWorks', 'Puzzld', 'Jolly', 'Sprout', 'Wonder', 'Rattle'],
    types: [
      'Wooden Puzzle', 'Building Blocks Set', 'Board Game', 'Soft Plush Toy', 'Remote Control Car',
      'Rubik Speed Cube', 'Art & Craft Kit', 'Toy Kitchen Set', 'Jigsaw Puzzle', 'Card Game',
      'Stacking Rings', 'Science Kit',
    ],
    adjectives: ['Montessori', 'Educational', 'Classic', 'Deluxe', 'Junior', 'Family', 'Eco', 'Travel', 'Giant', 'Beginner'],
    attrKey: 'age',
    attrValues: ['3+', '5+', '8+', '12+'],
    colors: ['Multicolour', 'Natural', 'Pastel'],
    priceRange: [199, 7999],
    marginPct: [0.35, 0.55],
    imageSeeds: [
      'photo-1558060370-d644479cb6f7',
      'photo-1566576912321-d58ddd7a6088',
      'photo-1587654780291-39c9404d746b',
    ],
  },
  {
    category: 'furniture',
    brands: ['Timber & Co', 'Kaarigar', 'Nook', 'Sagwan', 'Studio Nine', 'Baithak', 'Grain', 'Maple', 'Anvaya', 'Loft'],
    types: [
      'Solid Wood Bookshelf', 'Study Desk', 'Accent Chair', 'Coffee Table', 'Shoe Rack',
      'Bedside Table', 'Folding Dining Table', 'TV Unit', 'Ottoman Stool', 'Wall Shelf',
      'Office Chair', 'Bar Stool',
    ],
    adjectives: ['Sheesham', 'Mango Wood', 'Scandinavian', 'Compact', 'Rustic', 'Modern', 'Handcrafted', 'Space-Saving', 'Mid-Century', 'Premium'],
    attrKey: 'material',
    attrValues: ['Sheesham', 'Mango Wood', 'Engineered Wood', 'Metal & Wood'],
    colors: ['Walnut', 'Honey', 'Natural', 'Charcoal', 'White'],
    priceRange: [1499, 59999],
    marginPct: [0.25, 0.45],
    imageSeeds: [
      'photo-1555041469-a586c61ea9bc',
      'photo-1567538096630-e0c55bd6374c',
      'photo-1540574163026-643ea20ade25',
      'photo-1550226891-ef816aed4a98',
    ],
  },
  {
    category: 'grocery-gourmet',
    brands: ['Harvest', 'Sattvik', 'Kisan', 'Terroir', 'Amrit', 'Bagan', 'Pantry', 'Malabar', 'Nilgiri', 'Konkan'],
    types: [
      'Single Origin Coffee', 'Darjeeling Green Tea', 'Cold Pressed Oil', 'Raw Forest Honey', 'Assorted Dry Fruits',
      'Masala Blend', 'Organic Basmati Rice', 'Artisanal Chocolate', 'Millet Muesli', 'Herbal Infusion',
      'Ghee', 'Nut Butter',
    ],
    adjectives: ['Organic', 'Single Estate', 'Small Batch', 'Cold Pressed', 'Stone Ground', 'Artisanal', 'Unrefined', 'Wild', 'Heritage', 'Farm Fresh'],
    attrKey: 'capacity',
    attrValues: ['250g', '500g', '1kg', '200ml', '500ml'],
    priceRange: [149, 4999],
    marginPct: [0.3, 0.5],
    imageSeeds: [
      'photo-1542838132-92c53300491e',
      'photo-1553909489-cd47e0907980',
      'photo-1584473457409-ae5c91d7d8b1',
      'photo-1506617564039-2f3b650b7010',
    ],
  },
  {
    category: 'watches-accessories',
    brands: ['Meridian', 'Chronos', 'Kairos', 'Orbit', 'Halcyon', 'Aristo', 'Tempus', 'Vega', 'Lumen', 'Cobalt'],
    types: [
      'Automatic Watch', 'Chronograph Watch', 'Leather Wallet', 'Canvas Belt', 'Aviator Sunglasses',
      'Minimalist Watch', 'Card Holder', 'Leather Strap', 'Cufflink Set', 'Sunglasses Case',
      'Messenger Bag', 'Travel Pouch',
    ],
    adjectives: ['Skeleton', 'Field', 'Diver', 'Handstitched', 'Full-Grain', 'Polarised', 'Slim', 'Heritage', 'Titanium', 'Everyday'],
    attrKey: 'color',
    attrValues: ['Black', 'Tan', 'Brown', 'Steel', 'Rose Gold'],
    priceRange: [599, 39999],
    marginPct: [0.3, 0.5],
    imageSeeds: [
      'photo-1524592094714-0f0654e20314',
      'photo-1523170335258-f5ed11844a49',
      'photo-1547996160-81dfa63595aa',
      'photo-1434056886845-dac89ffe9b56',
    ],
  },
  {
    category: 'pet-supplies',
    brands: ['Waggle', 'Pawsome', 'Barkly', 'Whisker', 'Fetch', 'Snout', 'Tailwind', 'Purrfect', 'Kibble Co.', 'Den'],
    types: [
      'Dog Chew Toy', 'Cat Scratching Post', 'Pet Bed', 'Grooming Brush', 'Adjustable Harness',
      'Ceramic Feeding Bowl', 'Retractable Leash', 'Litter Tray', 'Pet Carrier', 'Training Treats',
      'Cat Tunnel', 'Water Fountain',
    ],
    adjectives: ['Orthopaedic', 'Chew-Proof', 'Washable', 'Reflective', 'Anti-Slip', 'Cosy', 'Travel', 'Interactive', 'Hypoallergenic', 'Everyday'],
    attrKey: 'size',
    attrValues: ['Small', 'Medium', 'Large'],
    colors: ['Grey', 'Cream', 'Teal', 'Rust'],
    priceRange: [199, 9999],
    marginPct: [0.35, 0.55],
    imageSeeds: [
      'photo-1450778869180-41d0601e046e',
      'photo-1591768575198-88dac53fbd0a',
      'photo-1548199973-03cce0bbc87b',
      'photo-1596492784531-6e6eb5ea9993',
    ],
  },
];

// ---- Helpers ----

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function uniqueSlug(base: string, seq: number) {
  return `bulk-${slugify(base)}-${seq.toString(36)}`;
}

// Returns a synthetic but realistic-looking product spec.
function makeProduct(spec: CatalogSpec, seq: number) {
  const brand = rand(spec.brands);
  const type = rand(spec.types);
  const adj = rand(spec.adjectives);
  const title = `${brand} ${adj} ${type}`;
  const slug = uniqueSlug(title, seq);

  const list = randInt(spec.priceRange[0], spec.priceRange[1]);
  const margin = spec.marginPct[0] + Math.random() * (spec.marginPct[1] - spec.marginPct[0]);
  const min = Math.max(50, Math.round(list * (1 - margin)));

  const imgSeed = rand(spec.imageSeeds);
  // Use Unsplash with the photo ID — these are confirmed-working IDs.
  const image = `https://images.unsplash.com/${imgSeed}?w=900&q=80`;

  // 1 or 2 variants per product to keep volume sane.
  const variantCount = Math.random() < 0.6 ? 1 : 2;
  const variants: Array<{ sku: string; attrs: Record<string, string>; stock: number; listPrice: number; minPrice: number; imageUrl: string }> = [];

  if (spec.attrKey && spec.attrValues) {
    const picked = new Set<string>();
    for (let i = 0; i < variantCount; i++) {
      let v = rand(spec.attrValues);
      let guard = 0;
      while (picked.has(v) && guard++ < 5) v = rand(spec.attrValues);
      picked.add(v);
      const color = spec.colors ? rand(spec.colors) : undefined;
      variants.push({
        sku: `${slug}-${i}`.toUpperCase().slice(0, 32),
        attrs: { [spec.attrKey]: v, ...(color ? { color } : {}) },
        stock: randInt(0, 50),
        listPrice: list,
        minPrice: min,
        imageUrl: image,
      });
    }
  } else {
    variants.push({
      sku: `${slug}-0`.toUpperCase().slice(0, 32),
      attrs: {},
      stock: randInt(0, 50),
      listPrice: list,
      minPrice: min,
      imageUrl: image,
    });
  }

  // Lightweight description (don't need anything fancy).
  const description = `${title} — ${adj.toLowerCase()} ${type.toLowerCase()} from ${brand}. Hand-picked for the Bazaar marketplace.`;

  return { title, slug, brand, description, image, variants };
}

// ---- Main ----

async function main() {
  console.log(`🌱  Bulk seed — generating ${TARGET_PRODUCTS} products`);

  const sellers = await prisma.seller.findMany({ where: { status: 'APPROVED' } });
  if (sellers.length === 0) {
    console.error('No approved sellers. Run `pnpm db:seed` first.');
    process.exit(1);
  }
  const cats = await prisma.category.findMany();
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  // Skip products that already exist (by slug prefix `bulk-`).
  const existing = await prisma.product.count({ where: { slug: { startsWith: 'bulk-' } } });
  console.log(`   Existing bulk products: ${existing}`);
  if (existing >= TARGET_PRODUCTS) {
    console.log('✅  Target already met. Done.');
    return;
  }
  const need = TARGET_PRODUCTS - existing;
  const startSeq = existing;

  let inserted = 0;
  let seq = startSeq;
  const startedAt = Date.now();

  while (inserted < need) {
    const productsToCreate: Array<Parameters<typeof prisma.product.create>[0]['data']> = [];
    const batchSize = Math.min(BATCH, need - inserted);

    for (let i = 0; i < batchSize; i++) {
      const spec = CATALOGS[seq % CATALOGS.length]!;
      const cat = catBySlug.get(spec.category);
      const seller = sellers[seq % sellers.length]!;
      const p = makeProduct(spec, seq);
      seq++;

      productsToCreate.push({
        sellerId: seller.id,
        categoryId: cat?.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        brand: p.brand,
        status: ProductStatus.ACTIVE,
        minListPrice: Math.min(...p.variants.map((v) => v.listPrice)),
        rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: randInt(0, 250),
        images: { create: [{ url: p.image, position: 0, alt: p.title }] },
        variants: { create: p.variants },
      });
    }

    // Use Promise.all over individual creates because nested writes can't go through createMany.
    const results = await Promise.all(
      productsToCreate.map((data) =>
        prisma.product.create({ data, select: { id: true } }).catch(() => null),
      ),
    );
    const ok = results.filter(Boolean).length;
    inserted += ok;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const rate = (inserted / Number(elapsed)).toFixed(0);
    console.log(`   +${ok}  total=${existing + inserted}/${TARGET_PRODUCTS}  ${elapsed}s (${rate}/s)`);
  }

  console.log('✅  Bulk seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
