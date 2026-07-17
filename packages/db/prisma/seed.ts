/* eslint-disable no-console */
import { PrismaClient, Role, SellerStatus, ProductStatus } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

async function main() {
  console.log('🌱  Seeding database…');

  // ---------- Users ----------
  const adminPwd = hashPassword('admin12345');
  const buyerPwd = hashPassword('buyer12345');
  const sellerPwd = hashPassword('seller12345');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bazaar.dev' },
    update: {},
    create: {
      email: 'admin@bazaar.dev',
      name: 'Platform Admin',
      role: Role.ADMIN,
      passwordHash: adminPwd,
      emailVerified: new Date(),
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@bazaar.dev' },
    update: {},
    create: {
      email: 'buyer@bazaar.dev',
      name: 'Aarav Buyer',
      role: Role.BUYER,
      passwordHash: buyerPwd,
      emailVerified: new Date(),
    },
  });

  const sellerSpecs = [
    { email: 'shoes@bazaar.dev', name: 'Stride Co.', store: 'Stride Footwear' },
    { email: 'gadgets@bazaar.dev', name: 'Volt Labs', store: 'Volt Gadgets' },
    { email: 'home@bazaar.dev', name: 'Hearth & Home', store: 'Hearth & Home' },
  ];

  const sellers = [];
  for (const s of sellerSpecs) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        name: s.name,
        role: Role.SELLER,
        passwordHash: sellerPwd,
        emailVerified: new Date(),
      },
    });
    const seller = await prisma.seller.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        storeName: s.store,
        slug: slugify(s.store),
        bio: `${s.store} — quality you can trust.`,
        status: SellerStatus.APPROVED,
      },
    });
    sellers.push(seller);
  }

  // ---------- Categories ----------
  // Keep in sync with the CategorySlug union in seed-bulk.ts.
  const catSpecs = [
    { name: 'Footwear', slug: 'footwear' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Home & Kitchen', slug: 'home-kitchen' },
    { name: 'Fashion', slug: 'fashion' },
    { name: 'Beauty', slug: 'beauty' },
    { name: 'Sports & Fitness', slug: 'sports-fitness' },
    { name: 'Books & Stationery', slug: 'books-stationery' },
    { name: 'Toys & Games', slug: 'toys-games' },
    { name: 'Furniture', slug: 'furniture' },
    { name: 'Grocery & Gourmet', slug: 'grocery-gourmet' },
    { name: 'Watches & Accessories', slug: 'watches-accessories' },
    { name: 'Pet Supplies', slug: 'pet-supplies' },
  ];
  const categories: Record<string, { id: string }> = {};
  for (const [i, c] of catSpecs.entries()) {
    categories[c.slug] = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, position: i },
    });
  }

  // ---------- Products ----------
  const productSpecs: Array<{
    seller: number;
    category: string;
    title: string;
    brand: string;
    description: string;
    images: string[];
    variants: Array<{ sku: string; attrs: Record<string, string>; listPrice: number; minPrice: number; stock: number }>;
  }> = [
    {
      seller: 0,
      category: 'footwear',
      title: 'AeroRun Pro Running Shoes',
      brand: 'Stride',
      description:
        'Lightweight mesh upper, responsive foam midsole, and durable rubber outsole. Engineered for daily runs.',
      images: [
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900',
        'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=900',
      ],
      variants: [
        { sku: 'AERO-BLK-9', attrs: { color: 'Black', size: '9' }, listPrice: 4999, minPrice: 3200, stock: 25 },
        { sku: 'AERO-BLK-10', attrs: { color: 'Black', size: '10' }, listPrice: 4999, minPrice: 3200, stock: 18 },
        { sku: 'AERO-WHT-9', attrs: { color: 'White', size: '9' }, listPrice: 4999, minPrice: 3200, stock: 12 },
      ],
    },
    {
      seller: 0,
      category: 'footwear',
      title: 'Trail Blaze Hiking Boots',
      brand: 'Stride',
      description: 'Waterproof leather, aggressive lugs, all-day cushioning for tough trails.',
      images: ['https://images.unsplash.com/photo-1520975916090-3105956dac38?w=900'],
      variants: [
        { sku: 'TRAIL-BRN-9', attrs: { color: 'Brown', size: '9' }, listPrice: 7499, minPrice: 4900, stock: 10 },
        { sku: 'TRAIL-BRN-10', attrs: { color: 'Brown', size: '10' }, listPrice: 7499, minPrice: 4900, stock: 8 },
      ],
    },
    {
      seller: 1,
      category: 'electronics',
      title: 'Volt Buds Pro Wireless Earbuds',
      brand: 'Volt',
      description: 'Active noise cancellation, 30-hour battery, IPX5 sweat-resistant.',
      images: ['https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=900'],
      variants: [
        { sku: 'BUDS-BLK', attrs: { color: 'Black' }, listPrice: 3499, minPrice: 2200, stock: 50 },
        { sku: 'BUDS-WHT', attrs: { color: 'White' }, listPrice: 3499, minPrice: 2200, stock: 35 },
      ],
    },
    {
      seller: 1,
      category: 'electronics',
      title: 'Volt Charge 65W GaN Adapter',
      brand: 'Volt',
      description: 'Compact dual-port USB-C charger. Charges laptop + phone simultaneously.',
      images: ['https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900'],
      variants: [
        { sku: 'CHG-65W', attrs: {}, listPrice: 2299, minPrice: 1450, stock: 80 },
      ],
    },
    {
      seller: 2,
      category: 'home-kitchen',
      title: 'Artisan Ceramic Dinner Set (16-piece)',
      brand: 'Hearth',
      description: 'Hand-glazed stoneware. Microwave & dishwasher safe. Service for 4.',
      images: ['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900'],
      variants: [
        { sku: 'DSET-IVY', attrs: { color: 'Ivory' }, listPrice: 5499, minPrice: 3600, stock: 14 },
        { sku: 'DSET-SLT', attrs: { color: 'Slate' }, listPrice: 5499, minPrice: 3600, stock: 9 },
      ],
    },
    {
      seller: 2,
      category: 'home-kitchen',
      title: 'Whisper Quiet Air Purifier',
      brand: 'Hearth',
      description: 'HEPA-13 filter, covers up to 400 sq ft, 24 dB sleep mode.',
      images: ['https://images.unsplash.com/photo-1585338447937-7082f8fc763d?w=900'],
      variants: [
        { sku: 'AIR-PURIFIER', attrs: {}, listPrice: 12999, minPrice: 8500, stock: 6 },
      ],
    },
  ];

  for (const p of productSpecs) {
    const slug = slugify(p.title);
    const product = await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        sellerId: sellers[p.seller]!.id,
        categoryId: categories[p.category]!.id,
        title: p.title,
        slug,
        brand: p.brand,
        description: p.description,
        status: ProductStatus.ACTIVE,
        minListPrice: Math.min(...p.variants.map((v) => v.listPrice)),
        images: {
          create: p.images.map((url, i) => ({ url, position: i, alt: p.title })),
        },
        variants: {
          create: p.variants.map((v) => ({
            sku: v.sku,
            attrs: v.attrs,
            listPrice: v.listPrice,
            minPrice: v.minPrice,
            stock: v.stock,
            imageUrl: p.images[0],
          })),
        },
      },
    });

    // A couple of seed reviews
    await prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: buyer.id } },
      update: {},
      create: {
        productId: product.id,
        userId: buyer.id,
        rating: 5,
        title: 'Loved it!',
        body: 'Quality is great and shipping was fast.',
        verifiedPurchase: true,
      },
    });
  }

  // ---------- Address for buyer ----------
  await prisma.address.upsert({
    where: { id: 'seed-addr-buyer' },
    update: {},
    create: {
      id: 'seed-addr-buyer',
      userId: buyer.id,
      fullName: 'Aarav Buyer',
      phone: '9999999999',
      line1: '221B Baker Street',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      country: 'IN',
      isDefault: true,
    },
  });

  // ---------- Sample coupon ----------
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', type: 'PERCENT', value: 10, maxDiscount: 500 },
  });

  console.log('✅  Seed complete.');
  console.log('   Admin:  admin@bazaar.dev / admin12345');
  console.log('   Buyer:  buyer@bazaar.dev / buyer12345');
  console.log('   Seller: shoes@bazaar.dev / seller12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
