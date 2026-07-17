/**
 * Marketplace taxonomy — departments -> subcategories -> product types.
 *
 * Two levels, deliberately. A flat list of thousands of categories would make
 * the facet rail unusable; departments give the header its nav, subcategories
 * give the facet rail and breadcrumbs something navigable, and `types` supply
 * the product variety underneath.
 *
 * Only `Category` rows are created from this: departments are roots
 * (parentId = null) and subcategories point at them. Products always attach to
 * a SUBcategory, never a department.
 *
 * Every image seed here has been verified to return HTTP 200 from Unsplash.
 * Do not add an unverified ID — dead images are the single most visible defect
 * on a seeded storefront.
 */

export type AttrKey = 'size' | 'color' | 'capacity' | 'material' | 'age' | 'variant';

export interface SubSpec {
  name: string;
  slug: string;
  /** Product nouns. The main driver of catalogue variety. */
  types: string[];
  attrKey?: AttrKey;
  attrValues?: string[];
  /** [low, high] for listPrice, in rupees. */
  priceRange: [number, number];
}

export interface DeptSpec {
  name: string;
  slug: string;
  brands: string[];
  adjectives: string[];
  colors?: string[];
  /** [low, high] for (list - min) / list — the seller's negotiable range. */
  marginPct: [number, number];
  imageSeeds: string[];
  subs: SubSpec[];
}

export const TAXONOMY: DeptSpec[] = [
  {
    name: 'Footwear',
    slug: 'footwear',
    brands: ['Stride', 'Pace', 'TrailX', 'Kicks Co.', 'Sole', 'Dash', 'Velvet', 'Aero', 'Bolt', 'Drift', 'Nomad', 'Cobble'],
    adjectives: ['Lightweight', 'All-Terrain', 'Premium', 'Daily', 'Pro', 'Classic', 'Urban', 'Ultra', 'Eco', 'Comfort', 'Everyday', 'Marathon'],
    colors: ['Black', 'White', 'Grey', 'Navy', 'Brown', 'Tan', 'Olive', 'Maroon'],
    marginPct: [0.25, 0.5],
    imageSeeds: ['photo-1542291026-7eec264c27ff', 'photo-1600185365483-26d7a4cc7519', 'photo-1520975916090-3105956dac38', 'photo-1525966222134-fcfa99b8ae77', 'photo-1460353581641-37baddab0fa2', 'photo-1551107696-a4b0c5a0d9a2'],
    subs: [
      { name: 'Running Shoes', slug: 'running-shoes', types: ['Running Shoes', 'Marathon Trainers', 'Road Runners', 'Trail Runners', 'Racing Flats', 'Cushioned Runners', 'Stability Shoes', 'Jogging Shoes'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11', '12'], priceRange: [899, 12999] },
      { name: 'Sneakers', slug: 'sneakers', types: ['Sneakers', 'High-Top Sneakers', 'Canvas Shoes', 'Skate Shoes', 'Chunky Sneakers', 'Slip-On Sneakers', 'Retro Trainers', 'Court Sneakers'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11'], priceRange: [799, 9999] },
      { name: 'Formal Shoes', slug: 'formal-shoes', types: ['Oxford Shoes', 'Derby Shoes', 'Brogues', 'Loafers', 'Monk Straps', 'Penny Loafers', 'Dress Shoes'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11'], priceRange: [1499, 14999] },
      { name: 'Sandals & Flip Flops', slug: 'sandals-flip-flops', types: ['Sandals', 'Flip Flops', 'Sliders', 'Floaters', 'Chappals', 'Beach Sandals', 'Comfort Sandals'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11'], priceRange: [199, 3999] },
      { name: 'Boots', slug: 'boots', types: ['Hiking Boots', 'Chelsea Boots', 'Combat Boots', 'Ankle Boots', 'Work Boots', 'Desert Boots', 'Snow Boots'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11'], priceRange: [1999, 17999] },
      { name: 'Sports Shoes', slug: 'sports-shoes', types: ['Training Shoes', 'Basketball Shoes', 'Football Studs', 'Cricket Spikes', 'Badminton Shoes', 'Tennis Shoes', 'Gym Trainers'], attrKey: 'size', attrValues: ['6', '7', '8', '9', '10', '11'], priceRange: [999, 13999] },
      { name: 'Ethnic Footwear', slug: 'ethnic-footwear', types: ['Kolhapuri Chappals', 'Juttis', 'Mojaris', 'Ethnic Sandals', 'Embroidered Flats', 'Punjabi Juttis'], attrKey: 'size', attrValues: ['5', '6', '7', '8', '9', '10'], priceRange: [499, 5999] },
      { name: 'Kids Shoes', slug: 'kids-shoes', types: ['Kids Sneakers', 'School Shoes', 'Kids Sandals', 'Velcro Shoes', 'Toddler Booties', 'Kids Sports Shoes'], attrKey: 'size', attrValues: ['1', '2', '3', '4', '5'], priceRange: [299, 3999] },
    ],
  },
  {
    name: 'Electronics',
    slug: 'electronics',
    brands: ['Volt', 'Nimbus', 'Zenith', 'Pixel', 'Sonix', 'Quark', 'Hertz', 'NovaTek', 'Lumix', 'Ampere', 'Cortex', 'Helio'],
    adjectives: ['Pro', 'Mini', 'Max', 'Air', 'Ultra', 'Lite', 'Studio', 'Plus', '2024 Edition', 'Premium', 'Neo', 'Core'],
    colors: ['Black', 'White', 'Silver', 'Space Grey', 'Midnight', 'Graphite'],
    marginPct: [0.2, 0.4],
    imageSeeds: ['photo-1498049794561-7780e7231661', 'photo-1583394838336-acd977736f90', 'photo-1546435770-a3e426bf472b', 'photo-1572569511254-d8f925fe2cbb', 'photo-1511707171634-5f897ff02aa9', 'photo-1593642632559-0c6d3fc62b89', 'photo-1518770660439-4636190af475'],
    subs: [
      { name: 'Mobiles', slug: 'mobiles', types: ['Smartphone', '5G Smartphone', 'Feature Phone', 'Rugged Phone', 'Foldable Phone', 'Gaming Phone'], attrKey: 'variant', attrValues: ['64GB', '128GB', '256GB', '512GB'], priceRange: [4999, 149999] },
      { name: 'Laptops', slug: 'laptops', types: ['Laptop', 'Ultrabook', 'Gaming Laptop', 'Chromebook', '2-in-1 Convertible', 'Workstation Laptop'], attrKey: 'variant', attrValues: ['8GB/256GB', '16GB/512GB', '16GB/1TB', '32GB/1TB'], priceRange: [24999, 249999] },
      { name: 'Audio', slug: 'audio', types: ['Wireless Earbuds', 'Bluetooth Speaker', 'Wired Headphones', 'Over-Ear Headphones', 'Neckband Earphones', 'Soundbar', 'Party Speaker', 'Studio Monitors', 'Podcast Microphone'], attrKey: 'color', attrValues: ['Black', 'White', 'Blue', 'Beige'], priceRange: [499, 49999] },
      { name: 'Wearables', slug: 'wearables', types: ['Smart Watch', 'Fitness Band', 'Smart Ring', 'GPS Sports Watch', 'Kids Smartwatch'], attrKey: 'color', attrValues: ['Black', 'Silver', 'Rose Gold'], priceRange: [999, 59999] },
      { name: 'Cameras', slug: 'cameras', types: ['Mirrorless Camera', 'DSLR Camera', 'Action Camera', 'Instant Camera', 'Camera Lens', 'Vlogging Kit', 'Drone Camera'], attrKey: 'variant', attrValues: ['Body Only', 'Kit Lens', 'Twin Lens'], priceRange: [4999, 199999] },
      { name: 'Computer Accessories', slug: 'computer-accessories', types: ['Mechanical Keyboard', 'Gaming Mouse', 'Wireless Mouse', 'HD Webcam', 'Laptop Stand', 'USB-C Hub', 'Docking Station', 'Mouse Pad', 'Laptop Sleeve', 'Cable Organiser'], attrKey: 'color', attrValues: ['Black', 'White', 'Grey'], priceRange: [299, 24999] },
      { name: 'Gaming', slug: 'gaming', types: ['Gaming Console', 'Wireless Controller', 'Gaming Headset', 'Racing Wheel', 'VR Headset', 'Arcade Stick', 'Console Game'], attrKey: 'variant', attrValues: ['Standard', 'Digital', 'Bundle'], priceRange: [999, 79999] },
      { name: 'Storage & Power', slug: 'storage-power', types: ['Power Bank', 'USB-C Charger', 'SSD External Drive', 'Pen Drive', 'Memory Card', 'Surge Protector', 'Wireless Charger', 'Portable Hard Disk'], attrKey: 'capacity', attrValues: ['64GB', '128GB', '256GB', '1TB', '10000mAh', '20000mAh'], priceRange: [399, 29999] },
      { name: 'TV & Home Theatre', slug: 'tv-home-theatre', types: ['Smart TV', '4K LED TV', 'Streaming Stick', 'Projector', 'Home Theatre System', 'TV Wall Mount', 'Set-Top Box'], attrKey: 'variant', attrValues: ['32 inch', '43 inch', '55 inch', '65 inch'], priceRange: [1499, 199999] },
    ],
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    brands: ['Hearth', 'Casa', 'Kindred', 'Nest', 'Atelier', 'Saaj', 'Mela', 'Tava', 'Otto', 'Linea', 'Chaupal', 'Rasoi'],
    adjectives: ['Artisan', 'Hand-Crafted', 'Modern', 'Vintage', 'Eco', 'Premium', 'Minimalist', 'Heritage', 'Designer', 'Cosy', 'Everyday', 'Classic'],
    colors: ['Ivory', 'Slate', 'Terracotta', 'Forest', 'Charcoal', 'Sand'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1556909114-f6e7ad7d3136', 'photo-1585338447937-7082f8fc763d', 'photo-1567016432779-094069958ea5', 'photo-1493663284031-b7e3aefcae8e', 'photo-1583847268964-b28dc8f51f92'],
    subs: [
      { name: 'Cookware', slug: 'cookware', types: ['Stainless Cookware Set', 'Non-Stick Frying Pan', 'Cast Iron Skillet', 'Pressure Cooker', 'Kadai', 'Tawa', 'Saucepan', 'Wok', 'Casserole Dish', 'Idli Steamer'], attrKey: 'capacity', attrValues: ['1L', '2L', '3L', '5L', 'Set of 3'], priceRange: [399, 19999] },
      { name: 'Dining', slug: 'dining', types: ['Ceramic Dinner Set', 'Coffee Mug Set', 'Glass Tumblers', 'Bamboo Cutlery', 'Serving Tray', 'Dinner Plates', 'Bowls Set', 'Thali Set'], attrKey: 'variant', attrValues: ['Set of 2', 'Set of 4', 'Set of 6', 'Set of 12'], priceRange: [299, 14999] },
      { name: 'Bed Linen', slug: 'bed-linen', types: ['Bedsheet Set', 'Duvet Cover', 'Organic Pillow', 'Comforter', 'Mattress Protector', 'Pillow Covers', 'Blanket'], attrKey: 'size', attrValues: ['Single', 'Double', 'Queen', 'King'], priceRange: [499, 12999] },
      { name: 'Bath', slug: 'bath', types: ['Bath Towels', 'Bath Mat', 'Shower Curtain', 'Bathrobe', 'Hand Towels', 'Soap Dispenser', 'Toilet Brush Set'], attrKey: 'color', attrValues: ['White', 'Grey', 'Teal', 'Blush'], priceRange: [199, 5999] },
      { name: 'Home Decor', slug: 'home-decor', types: ['Wall Clock', 'Cushion Covers', 'Cotton Curtains', 'Photo Frame', 'Wall Art Print', 'Vase', 'Candle Holder', 'Wall Mirror', 'Dhurrie Rug', 'Macrame Hanging'], attrKey: 'color', attrValues: ['Ivory', 'Terracotta', 'Slate', 'Forest'], priceRange: [149, 17999] },
      { name: 'Storage & Organisation', slug: 'storage-organisation', types: ['Storage Boxes', 'Laundry Basket', 'Spice Rack', 'Drawer Organiser', 'Vacuum Storage Bags', 'Shoe Organiser', 'Airtight Containers'], attrKey: 'variant', attrValues: ['Small', 'Medium', 'Large', 'Set of 3'], priceRange: [199, 6999] },
      { name: 'Lighting', slug: 'lighting', types: ['Table Lamp', 'Floor Lamp', 'Fairy Lights', 'Pendant Light', 'LED Bulb Pack', 'Desk Lamp', 'Diya Set'], attrKey: 'color', attrValues: ['Warm White', 'Cool White', 'Amber'], priceRange: [199, 12999] },
      { name: 'Cleaning', slug: 'cleaning', types: ['Microfibre Cloth Pack', 'Spin Mop', 'Vacuum Cleaner', 'Dustbin', 'Cleaning Brush Set', 'Floor Cleaner Refill'], attrKey: 'variant', attrValues: ['Standard', 'Large', 'Pack of 6'], priceRange: [149, 24999] },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    brands: ['Khadi Co.', 'Verve', 'Indigo', 'Cotton & Co', 'Saanjh', 'Wovn', 'Kaveri', 'Loom', 'Aria', 'Mira', 'Chikan', 'Rangrez'],
    adjectives: ['Handloom', 'Festive', 'Everyday', 'Pastel', 'Monsoon', 'Resort', 'Office', 'Indo-Western', 'Premium', 'Limited Edition', 'Relaxed', 'Slim Fit'],
    colors: ['Indigo', 'Mustard', 'Ivory', 'Olive', 'Wine', 'Black', 'Powder Blue', 'Rust'],
    marginPct: [0.35, 0.55],
    imageSeeds: ['photo-1495121605193-b116b5b9c5fe', 'photo-1490481651871-ab68de25d43d', 'photo-1520006403909-838d6b92c22e', 'photo-1485231183945-fffde7cc051e', 'photo-1539109136881-3be0616acf4b'],
    subs: [
      { name: "Men's Topwear", slug: 'mens-topwear', types: ['Linen Shirt', 'Casual Tee', 'Polo Shirt', 'Cotton Kurta', 'Oxford Shirt', 'Henley Tee', 'Flannel Shirt', 'Printed Shirt'], attrKey: 'size', attrValues: ['S', 'M', 'L', 'XL', 'XXL'], priceRange: [399, 6999] },
      { name: "Men's Bottomwear", slug: 'mens-bottomwear', types: ['Slim Fit Jeans', 'Chinos', 'Cargo Trousers', 'Cotton Shorts', 'Formal Trousers', 'Joggers', 'Pyjamas'], attrKey: 'size', attrValues: ['28', '30', '32', '34', '36', '38'], priceRange: [499, 5999] },
      { name: "Women's Ethnic", slug: 'womens-ethnic', types: ['Pure Silk Saree', 'Anarkali Suit', 'Cotton Kurti', 'Lehenga Set', 'Palazzo Set', 'Dupatta', 'Salwar Suit', 'Chanderi Saree'], attrKey: 'size', attrValues: ['XS', 'S', 'M', 'L', 'XL'], priceRange: [699, 24999] },
      { name: "Women's Western", slug: 'womens-western', types: ['Block Print Dress', 'Wrap Skirt', 'Embroidered Top', 'Denim Jacket', 'Jumpsuit', 'Blazer', 'Culottes', 'Maxi Dress'], attrKey: 'size', attrValues: ['XS', 'S', 'M', 'L', 'XL'], priceRange: [599, 8999] },
      { name: 'Innerwear', slug: 'innerwear', types: ['Cotton Vest Pack', 'Boxer Briefs', 'Seamless Bra', 'Camisole', 'Thermal Set', 'Socks Pack'], attrKey: 'size', attrValues: ['S', 'M', 'L', 'XL'], priceRange: [199, 2999] },
      { name: 'Winterwear', slug: 'winterwear', types: ['Hoodie', 'Puffer Jacket', 'Woollen Sweater', 'Cardigan', 'Muffler', 'Beanie', 'Fleece Jacket', 'Shawl'], attrKey: 'size', attrValues: ['S', 'M', 'L', 'XL', 'XXL'], priceRange: [599, 9999] },
      { name: 'Kidswear', slug: 'kidswear', types: ['Kids Tee', 'Kids Frock', 'Kids Dungaree', 'School Uniform Set', 'Kids Jacket', 'Kids Nightsuit'], attrKey: 'age', attrValues: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-12Y'], priceRange: [249, 3999] },
      { name: 'Bags & Luggage', slug: 'bags-luggage', types: ['Backpack', 'Tote Bag', 'Cabin Trolley', 'Sling Bag', 'Laptop Backpack', 'Duffel Bag', 'Jute Bag'], attrKey: 'variant', attrValues: ['Small', 'Medium', 'Large'], priceRange: [399, 19999] },
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    brands: ['Glow', 'Rooted', 'Pure', 'Dewdrop', 'Botani', 'Vana', 'Aurelia', 'Ojas', 'Hue', 'Bloom', 'Neem & Co', 'Attar'],
    adjectives: ['Ayurvedic', 'Natural', 'Vegan', 'Probiotic', 'Glowing', 'Brightening', 'Soothing', 'Radiance', 'Nourishing', 'Daily', 'Gentle', 'Intense'],
    marginPct: [0.4, 0.6],
    imageSeeds: ['photo-1571781926291-c477ebfd024b', 'photo-1556228720-195a672e8a03', 'photo-1522335789203-aabd1fc54bc9', 'photo-1612817288484-6f916006741a', 'photo-1596462502278-27bfdc403348'],
    subs: [
      { name: 'Skincare', slug: 'skincare', types: ['Vitamin C Serum', 'Hydrating Moisturiser', 'Niacinamide Serum', 'Sunscreen SPF 50', 'Face Wash', 'Face Mist', 'Clay Mask', 'Under Eye Cream', 'Retinol Serum', 'Toner'], attrKey: 'capacity', attrValues: ['30ml', '50ml', '100ml', '200ml'], priceRange: [199, 4999] },
      { name: 'Haircare', slug: 'haircare', types: ['Hair Oil', 'Hair Mask', 'Sulphate-Free Shampoo', 'Conditioner', 'Hair Serum', 'Scalp Scrub', 'Dry Shampoo'], attrKey: 'capacity', attrValues: ['100ml', '200ml', '300ml', '500ml'], priceRange: [149, 3499] },
      { name: 'Makeup', slug: 'makeup', types: ['Lip & Cheek Tint', 'Kajal Pencil', 'Liquid Foundation', 'Matte Lipstick', 'Compact Powder', 'Mascara', 'Eyeshadow Palette', 'Eyeliner', 'Highlighter'], attrKey: 'color', attrValues: ['Nude', 'Rose', 'Berry', 'Coral', 'Brick'], priceRange: [149, 3999] },
      { name: 'Fragrance', slug: 'fragrance', types: ['Eau de Parfum', 'Attar Roll-On', 'Body Mist', 'Perfume Gift Set', 'Deodorant', 'Solid Perfume'], attrKey: 'capacity', attrValues: ['10ml', '30ml', '50ml', '100ml'], priceRange: [299, 9999] },
      { name: "Men's Grooming", slug: 'mens-grooming', types: ['Beard Oil', 'Shaving Cream', 'Beard Trimmer Comb', 'Aftershave Balm', 'Face Scrub', 'Beard Wash'], attrKey: 'capacity', attrValues: ['30ml', '50ml', '100ml'], priceRange: [149, 2999] },
      { name: 'Bath & Body', slug: 'bath-body', types: ['Body Lotion', 'Foot Cream', 'Handmade Soap', 'Body Scrub', 'Shower Gel', 'Hand Cream', 'Bath Salts'], attrKey: 'capacity', attrValues: ['100ml', '200ml', '400ml'], priceRange: [99, 2499] },
    ],
  },
  {
    name: 'Sports & Fitness',
    slug: 'sports-fitness',
    brands: ['Vayu', 'Prana', 'IronOak', 'Summit', 'Tempo', 'Grit', 'Zeal', 'Apex', 'Terra', 'Pulse', 'Maidan', 'Crest'],
    adjectives: ['Pro', 'Lightweight', 'All-Weather', 'Everyday', 'Trail', 'Studio', 'Heavy-Duty', 'Compact', 'Eco', 'Performance', 'Competition', 'Beginner'],
    colors: ['Black', 'Steel', 'Forest', 'Sunset', 'Navy'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1517836357463-d25dfeac3438', 'photo-1571019613454-1cb2f99b2d8b', 'photo-1553062407-98eeb64c6a62', 'photo-1523362628745-0c100150b504', 'photo-1461896836934-ffe607ba8211'],
    subs: [
      { name: 'Hydration', slug: 'hydration', types: ['Insulated Water Bottle', 'Vacuum Flask', 'Hydration Bladder', 'Steel Sipper', 'Protein Shaker', 'Thermos Bottle', 'Collapsible Bottle'], attrKey: 'capacity', attrValues: ['500ml', '750ml', '1L', '1.5L'], priceRange: [249, 4999] },
      { name: 'Gym Equipment', slug: 'gym-equipment', types: ['Adjustable Dumbbell', 'Resistance Band Set', 'Kettlebell', 'Barbell Set', 'Weight Plates', 'Pull-Up Bar', 'Gym Gloves', 'Ab Roller', 'Skipping Rope'], attrKey: 'variant', attrValues: ['5kg', '10kg', '20kg', 'Standard'], priceRange: [299, 39999] },
      { name: 'Yoga & Wellness', slug: 'yoga-wellness', types: ['Yoga Mat', 'Foam Roller', 'Yoga Block', 'Meditation Cushion', 'Massage Ball', 'Yoga Strap', 'Acupressure Mat'], attrKey: 'color', attrValues: ['Purple', 'Teal', 'Charcoal', 'Sage'], priceRange: [299, 6999] },
      { name: 'Outdoor & Camping', slug: 'outdoor-camping', types: ['Hiking Backpack', 'Trekking Poles', 'Camping Tent', 'Sleeping Bag', 'Camping Stove', 'Head Torch', 'Compass', 'Camping Chair'], attrKey: 'capacity', attrValues: ['20L', '40L', '60L', '2 Person', '4 Person'], priceRange: [499, 29999] },
      { name: 'Cricket', slug: 'cricket', types: ['Cricket Bat', 'Cricket Ball', 'Batting Gloves', 'Cricket Pads', 'Wicket Set', 'Cricket Helmet', 'Kit Bag'], attrKey: 'size', attrValues: ['Size 4', 'Size 5', 'Size 6', 'Full'], priceRange: [299, 24999] },
      { name: 'Football', slug: 'football', types: ['Football', 'Shin Guards', 'Goalkeeper Gloves', 'Training Cones', 'Football Pump', 'Team Jersey'], attrKey: 'size', attrValues: ['Size 3', 'Size 4', 'Size 5'], priceRange: [299, 8999] },
      { name: 'Racquet Sports', slug: 'racquet-sports', types: ['Badminton Racquet', 'Tennis Racquet', 'Shuttlecock Pack', 'Table Tennis Bat', 'Squash Racquet', 'Racquet Grip', 'Tennis Balls'], attrKey: 'variant', attrValues: ['Beginner', 'Intermediate', 'Pro'], priceRange: [199, 19999] },
      { name: 'Cycling', slug: 'cycling', types: ['Cycling Helmet', 'Bike Lock', 'Cycle Pump', 'Bike Light Set', 'Cycling Gloves', 'Water Bottle Cage', 'Saddle Bag'], attrKey: 'variant', attrValues: ['Standard', 'Large'], priceRange: [199, 12999] },
      { name: 'Sports Bags', slug: 'sports-bags', types: ['Sports Duffel Bag', 'Gym Sack', 'Shoe Bag', 'Racquet Cover', 'Travel Backpack'], attrKey: 'variant', attrValues: ['Small', 'Medium', 'Large'], priceRange: [299, 7999] },
    ],
  },
  {
    name: 'Books & Stationery',
    slug: 'books-stationery',
    brands: ['Inkwell', 'Margin', 'Paper Co.', 'Quill', 'Folio', 'Scribe', 'Leaf', 'Athenaeum', 'Nib', 'Verso', 'Chapter', 'Kalam'],
    adjectives: ['Classic', 'Dotted', 'Ruled', 'Vintage', 'Minimalist', 'Handbound', 'Premium', 'Everyday', 'Artist', 'Limited Edition', 'Illustrated', 'Collector'],
    colors: ['Kraft', 'Midnight', 'Sage', 'Burgundy', 'Ivory'],
    marginPct: [0.35, 0.55],
    imageSeeds: ['photo-1512820790803-83ca734da794', 'photo-1544947950-fa07a98d237f', 'photo-1481627834876-b7833e8f5570', 'photo-1524995997946-a1c2e315a42f'],
    subs: [
      { name: 'Fiction', slug: 'fiction', types: ['Literary Novel', 'Mystery Novel', 'Science Fiction Novel', 'Short Story Collection', 'Historical Fiction', 'Fantasy Novel', 'Romance Novel'], attrKey: 'variant', attrValues: ['Paperback', 'Hardcover'], priceRange: [149, 1999] },
      { name: 'Non-Fiction', slug: 'non-fiction', types: ['Biography', 'Business Book', 'Self-Help Book', 'History Book', 'Popular Science Book', 'Travel Writing', 'Cookbook'], attrKey: 'variant', attrValues: ['Paperback', 'Hardcover'], priceRange: [199, 2999] },
      { name: 'Academic', slug: 'academic', types: ['Reference Textbook', 'Exam Guide', 'Question Bank', 'Study Companion', 'Atlas', 'Dictionary'], attrKey: 'variant', attrValues: ['Paperback', 'Hardcover'], priceRange: [199, 3999] },
      { name: 'Notebooks & Journals', slug: 'notebooks-journals', types: ['Hardcover Notebook', 'Bullet Journal', 'Leather Diary', 'Sketchbook', 'Desk Planner', 'Composition Book', 'Pocket Notebook'], attrKey: 'size', attrValues: ['A4', 'A5', 'A6', 'Pocket'], priceRange: [99, 2999] },
      { name: 'Writing Instruments', slug: 'writing-instruments', types: ['Fountain Pen', 'Gel Pen Set', 'Ballpoint Pen', 'Mechanical Pencil', 'Highlighter Set', 'Calligraphy Kit', 'Ink Bottle'], attrKey: 'color', attrValues: ['Black', 'Blue', 'Assorted'], priceRange: [49, 4999] },
      { name: 'Art Supplies', slug: 'art-supplies', types: ['Watercolour Set', 'Acrylic Paint Set', 'Sketching Pencils', 'Canvas Board', 'Brush Set', 'Colour Pencils', 'Markers Set'], attrKey: 'variant', attrValues: ['12 Shades', '24 Shades', '36 Shades'], priceRange: [99, 5999] },
      { name: 'Office Supplies', slug: 'office-supplies', types: ['Sticky Note Pack', 'File Folder Set', 'Stapler', 'Desk Organiser', 'Whiteboard', 'Book Stand', 'Paper Clips'], attrKey: 'variant', attrValues: ['Standard', 'Pack of 5', 'Pack of 10'], priceRange: [49, 3999] },
    ],
  },
  {
    name: 'Toys & Games',
    slug: 'toys-games',
    brands: ['Tinker', 'Playloop', 'Cubby', 'Whimsy', 'BrickWorks', 'Puzzld', 'Jolly', 'Sprout', 'Wonder', 'Rattle', 'Khel', 'Gilli'],
    adjectives: ['Montessori', 'Educational', 'Classic', 'Deluxe', 'Junior', 'Family', 'Eco', 'Travel', 'Giant', 'Beginner', 'Wooden', 'Interactive'],
    colors: ['Multicolour', 'Natural', 'Pastel'],
    marginPct: [0.35, 0.55],
    imageSeeds: ['photo-1558060370-d644479cb6f7', 'photo-1566576912321-d58ddd7a6088', 'photo-1587654780291-39c9404d746b'],
    subs: [
      { name: 'Building Blocks', slug: 'building-blocks', types: ['Building Blocks Set', 'Magnetic Tiles', 'Construction Kit', 'Wooden Blocks', 'Marble Run', 'Interlocking Bricks'], attrKey: 'age', attrValues: ['3+', '5+', '8+', '12+'], priceRange: [299, 9999] },
      { name: 'Board Games', slug: 'board-games', types: ['Board Game', 'Card Game', 'Strategy Game', 'Party Game', 'Chess Set', 'Ludo Board', 'Carrom Board'], attrKey: 'age', attrValues: ['5+', '8+', '12+', 'Adult'], priceRange: [199, 7999] },
      { name: 'Soft Toys', slug: 'soft-toys', types: ['Soft Plush Toy', 'Teddy Bear', 'Cuddle Cushion', 'Plush Animal', 'Rag Doll'], attrKey: 'variant', attrValues: ['Small', 'Medium', 'Jumbo'], priceRange: [199, 4999] },
      { name: 'Educational Toys', slug: 'educational-toys', types: ['Science Kit', 'Stacking Rings', 'Shape Sorter', 'Abacus', 'Alphabet Puzzle', 'Microscope Kit', 'Robotics Kit'], attrKey: 'age', attrValues: ['2+', '3+', '5+', '8+'], priceRange: [249, 8999] },
      { name: 'Puzzles', slug: 'puzzles', types: ['Jigsaw Puzzle', 'Wooden Puzzle', 'Rubik Speed Cube', 'Brain Teaser', '3D Puzzle', 'Tangram Set'], attrKey: 'variant', attrValues: ['100 Pieces', '500 Pieces', '1000 Pieces'], priceRange: [149, 3999] },
      { name: 'Outdoor Play', slug: 'outdoor-play', types: ['Water Gun', 'Kite', 'Frisbee', 'Skipping Rope', 'Sand Play Set', 'Bubble Maker', 'Badminton Set'], attrKey: 'age', attrValues: ['3+', '5+', '8+'], priceRange: [99, 4999] },
      { name: 'RC & Vehicles', slug: 'rc-vehicles', types: ['Remote Control Car', 'RC Drone', 'Die-Cast Car', 'Train Set', 'RC Boat', 'Toy Truck'], attrKey: 'age', attrValues: ['5+', '8+', '12+'], priceRange: [299, 12999] },
      { name: 'Pretend Play', slug: 'pretend-play', types: ['Toy Kitchen Set', 'Doctor Kit', 'Tool Set', 'Doll House', 'Cash Register', 'Tea Set'], attrKey: 'age', attrValues: ['3+', '5+'], priceRange: [299, 7999] },
    ],
  },
  {
    name: 'Furniture',
    slug: 'furniture',
    brands: ['Timber & Co', 'Kaarigar', 'Nook', 'Sagwan', 'Studio Nine', 'Baithak', 'Grain', 'Maple', 'Anvaya', 'Loft', 'Charpai', 'Teakwood'],
    adjectives: ['Sheesham', 'Mango Wood', 'Scandinavian', 'Compact', 'Rustic', 'Modern', 'Handcrafted', 'Space-Saving', 'Mid-Century', 'Premium', 'Foldable', 'Modular'],
    colors: ['Walnut', 'Honey', 'Natural', 'Charcoal', 'White'],
    marginPct: [0.25, 0.45],
    imageSeeds: ['photo-1555041469-a586c61ea9bc', 'photo-1567538096630-e0c55bd6374c', 'photo-1540574163026-643ea20ade25', 'photo-1550226891-ef816aed4a98'],
    subs: [
      { name: 'Seating', slug: 'seating', types: ['Accent Chair', 'Ottoman Stool', 'Bar Stool', 'Recliner', 'Bean Bag', 'Sofa Set', 'Bench', 'Rocking Chair'], attrKey: 'material', attrValues: ['Sheesham', 'Mango Wood', 'Fabric', 'Leatherette'], priceRange: [1499, 79999] },
      { name: 'Tables', slug: 'tables', types: ['Coffee Table', 'Study Desk', 'Folding Dining Table', 'Bedside Table', 'Console Table', 'Side Table', 'Dining Set'], attrKey: 'material', attrValues: ['Sheesham', 'Mango Wood', 'Engineered Wood', 'Metal & Wood'], priceRange: [1999, 99999] },
      { name: 'Storage Furniture', slug: 'storage-furniture', types: ['Solid Wood Bookshelf', 'Shoe Rack', 'TV Unit', 'Chest of Drawers', 'Wardrobe', 'Wall Shelf', 'Sideboard'], attrKey: 'material', attrValues: ['Sheesham', 'Engineered Wood', 'Metal & Wood'], priceRange: [1499, 89999] },
      { name: 'Beds & Mattresses', slug: 'beds-mattresses', types: ['Bed Frame', 'Memory Foam Mattress', 'Diwan', 'Headboard', 'Trundle Bed', 'Foldable Mattress'], attrKey: 'size', attrValues: ['Single', 'Double', 'Queen', 'King'], priceRange: [3999, 149999] },
      { name: 'Office Furniture', slug: 'office-furniture', types: ['Office Chair', 'Standing Desk', 'Filing Cabinet', 'Computer Table', 'Footrest', 'Monitor Riser'], attrKey: 'material', attrValues: ['Mesh', 'Leatherette', 'Engineered Wood'], priceRange: [1999, 59999] },
      { name: 'Outdoor Furniture', slug: 'outdoor-furniture', types: ['Garden Chair', 'Patio Set', 'Hammock', 'Swing Chair', 'Outdoor Bench', 'Folding Table'], attrKey: 'material', attrValues: ['Rattan', 'Teak', 'Metal'], priceRange: [1499, 49999] },
    ],
  },
  {
    name: 'Grocery & Gourmet',
    slug: 'grocery-gourmet',
    brands: ['Harvest', 'Sattvik', 'Kisan', 'Terroir', 'Amrit', 'Bagan', 'Pantry', 'Malabar', 'Nilgiri', 'Konkan', 'Araku', 'Coorg'],
    adjectives: ['Organic', 'Single Estate', 'Small Batch', 'Cold Pressed', 'Stone Ground', 'Artisanal', 'Unrefined', 'Wild', 'Heritage', 'Farm Fresh', 'Hand-Picked', 'Sun-Dried'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1542838132-92c53300491e', 'photo-1553909489-cd47e0907980', 'photo-1584473457409-ae5c91d7d8b1', 'photo-1506617564039-2f3b650b7010'],
    subs: [
      { name: 'Tea & Coffee', slug: 'tea-coffee', types: ['Single Origin Coffee', 'Darjeeling Green Tea', 'Assam Black Tea', 'Herbal Infusion', 'Instant Coffee', 'Masala Chai Blend', 'Cold Brew Pack', 'Coffee Beans'], attrKey: 'capacity', attrValues: ['100g', '250g', '500g', '1kg'], priceRange: [149, 4999] },
      { name: 'Oils & Ghee', slug: 'oils-ghee', types: ['Cold Pressed Oil', 'Ghee', 'Olive Oil', 'Coconut Oil', 'Mustard Oil', 'Sesame Oil'], attrKey: 'capacity', attrValues: ['200ml', '500ml', '1L'], priceRange: [199, 3999] },
      { name: 'Dry Fruits & Nuts', slug: 'dry-fruits-nuts', types: ['Assorted Dry Fruits', 'Almonds', 'Cashews', 'Walnuts', 'Pistachios', 'Raisins', 'Dates', 'Trail Mix'], attrKey: 'capacity', attrValues: ['200g', '500g', '1kg'], priceRange: [199, 5999] },
      { name: 'Spices & Masalas', slug: 'spices-masalas', types: ['Masala Blend', 'Whole Spices Pack', 'Turmeric Powder', 'Saffron', 'Black Pepper', 'Garam Masala', 'Chilli Powder'], attrKey: 'capacity', attrValues: ['50g', '100g', '250g', '500g'], priceRange: [99, 3999] },
      { name: 'Snacks', slug: 'snacks', types: ['Artisanal Chocolate', 'Baked Chips', 'Namkeen Mix', 'Granola Bar Pack', 'Roasted Makhana', 'Cookies', 'Popcorn'], attrKey: 'capacity', attrValues: ['100g', '200g', '400g'], priceRange: [79, 1999] },
      { name: 'Breakfast & Cereals', slug: 'breakfast-cereals', types: ['Millet Muesli', 'Rolled Oats', 'Cornflakes', 'Granola', 'Poha', 'Breakfast Mix'], attrKey: 'capacity', attrValues: ['250g', '500g', '1kg'], priceRange: [99, 1999] },
      { name: 'Staples', slug: 'staples', types: ['Organic Basmati Rice', 'Whole Wheat Atta', 'Toor Dal', 'Chana Dal', 'Quinoa', 'Millet Pack', 'Besan'], attrKey: 'capacity', attrValues: ['500g', '1kg', '5kg'], priceRange: [99, 2999] },
      { name: 'Sweeteners & Spreads', slug: 'sweeteners-spreads', types: ['Raw Forest Honey', 'Nut Butter', 'Jaggery Powder', 'Fruit Preserve', 'Maple Syrup', 'Date Syrup'], attrKey: 'capacity', attrValues: ['200g', '350g', '500g'], priceRange: [149, 2499] },
    ],
  },
  {
    name: 'Watches & Accessories',
    slug: 'watches-accessories',
    brands: ['Meridian', 'Chronos', 'Kairos', 'Orbit', 'Halcyon', 'Aristo', 'Tempus', 'Vega', 'Lumen', 'Cobalt', 'Solstice', 'Astra'],
    adjectives: ['Skeleton', 'Field', 'Diver', 'Handstitched', 'Full-Grain', 'Polarised', 'Slim', 'Heritage', 'Titanium', 'Everyday', 'Automatic', 'Classic'],
    colors: ['Black', 'Tan', 'Brown', 'Steel', 'Rose Gold'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1524592094714-0f0654e20314', 'photo-1523170335258-f5ed11844a49', 'photo-1547996160-81dfa63595aa', 'photo-1434056886845-dac89ffe9b56'],
    subs: [
      { name: 'Analog Watches', slug: 'analog-watches', types: ['Automatic Watch', 'Chronograph Watch', 'Minimalist Watch', 'Dive Watch', 'Dress Watch', 'Pilot Watch', 'Skeleton Watch'], attrKey: 'color', attrValues: ['Black', 'Steel', 'Rose Gold', 'Tan'], priceRange: [999, 79999] },
      { name: 'Watch Straps', slug: 'watch-straps', types: ['Leather Strap', 'NATO Strap', 'Metal Bracelet', 'Silicone Strap', 'Strap Tool Kit'], attrKey: 'variant', attrValues: ['18mm', '20mm', '22mm'], priceRange: [299, 4999] },
      { name: 'Wallets', slug: 'wallets', types: ['Leather Wallet', 'Card Holder', 'Bifold Wallet', 'Travel Pouch', 'Coin Purse', 'Passport Holder'], attrKey: 'color', attrValues: ['Black', 'Tan', 'Brown'], priceRange: [299, 7999] },
      { name: 'Belts', slug: 'belts', types: ['Canvas Belt', 'Leather Belt', 'Reversible Belt', 'Braided Belt', 'Formal Belt'], attrKey: 'size', attrValues: ['30', '32', '34', '36', '38'], priceRange: [299, 5999] },
      { name: 'Sunglasses', slug: 'sunglasses', types: ['Aviator Sunglasses', 'Wayfarer Sunglasses', 'Round Sunglasses', 'Sports Sunglasses', 'Sunglasses Case', 'Clip-On Shades'], attrKey: 'color', attrValues: ['Black', 'Tortoise', 'Gold'], priceRange: [399, 14999] },
      { name: 'Small Accessories', slug: 'small-accessories', types: ['Cufflink Set', 'Tie & Pocket Square', 'Keyring', 'Messenger Bag', 'Lapel Pin'], attrKey: 'color', attrValues: ['Steel', 'Gold', 'Black'], priceRange: [199, 9999] },
    ],
  },
  {
    name: 'Pet Supplies',
    slug: 'pet-supplies',
    brands: ['Waggle', 'Pawsome', 'Barkly', 'Whisker', 'Fetch', 'Snout', 'Tailwind', 'Purrfect', 'Kibble Co.', 'Den', 'Meow & Co', 'Pupper'],
    adjectives: ['Orthopaedic', 'Chew-Proof', 'Washable', 'Reflective', 'Anti-Slip', 'Cosy', 'Travel', 'Interactive', 'Hypoallergenic', 'Everyday', 'Grain-Free', 'Vet-Approved'],
    colors: ['Grey', 'Cream', 'Teal', 'Rust'],
    marginPct: [0.35, 0.55],
    imageSeeds: ['photo-1450778869180-41d0601e046e', 'photo-1591768575198-88dac53fbd0a', 'photo-1548199973-03cce0bbc87b', 'photo-1596492784531-6e6eb5ea9993'],
    subs: [
      { name: 'Dog Food & Treats', slug: 'dog-food-treats', types: ['Dry Dog Food', 'Training Treats', 'Wet Dog Food', 'Dental Chews', 'Puppy Food', 'Dog Biscuits'], attrKey: 'capacity', attrValues: ['500g', '1kg', '3kg', '10kg'], priceRange: [199, 7999] },
      { name: 'Dog Toys & Walk', slug: 'dog-toys-walk', types: ['Dog Chew Toy', 'Retractable Leash', 'Adjustable Harness', 'Fetch Ball', 'Rope Toy', 'Dog Collar', 'Poop Bag Holder'], attrKey: 'size', attrValues: ['Small', 'Medium', 'Large'], priceRange: [149, 4999] },
      { name: 'Cat Supplies', slug: 'cat-supplies', types: ['Cat Scratching Post', 'Litter Tray', 'Cat Tunnel', 'Cat Tree', 'Catnip Toy', 'Cat Litter', 'Cat Food'], attrKey: 'size', attrValues: ['Small', 'Medium', 'Large'], priceRange: [199, 12999] },
      { name: 'Pet Grooming', slug: 'pet-grooming', types: ['Grooming Brush', 'Pet Shampoo', 'Nail Clipper', 'Deshedding Tool', 'Grooming Glove', 'Ear Cleaner'], attrKey: 'variant', attrValues: ['Standard', 'Large'], priceRange: [149, 3999] },
      { name: 'Pet Bedding & Feeding', slug: 'pet-bedding-feeding', types: ['Pet Bed', 'Ceramic Feeding Bowl', 'Water Fountain', 'Pet Carrier', 'Travel Crate', 'Slow Feeder Bowl', 'Pet Blanket'], attrKey: 'size', attrValues: ['Small', 'Medium', 'Large'], priceRange: [299, 14999] },
      { name: 'Aquarium & Birds', slug: 'aquarium-birds', types: ['Aquarium Tank', 'Fish Food', 'Aquarium Filter', 'Bird Cage', 'Bird Feed', 'Aquarium Decor', 'Air Pump'], attrKey: 'capacity', attrValues: ['10L', '20L', '50L', 'Standard'], priceRange: [199, 19999] },
    ],
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    brands: ['Volt', 'Thermion', 'Breeze', 'Kelvin', 'Ampere', 'Rasoi', 'Crest', 'Zephyr', 'Helio', 'Nimbus', 'Aurum', 'Vayu'],
    adjectives: ['Energy-Efficient', 'Compact', 'Smart', 'Inverter', 'Digital', 'Heavy-Duty', 'Silent', 'Rapid', 'Premium', 'Everyday', 'Copper', 'Auto-Clean'],
    colors: ['White', 'Steel', 'Black', 'Silver'],
    marginPct: [0.2, 0.4],
    imageSeeds: ['photo-1585659722983-3a675dabf23d', 'photo-1574269909862-7e1d70bb8078', 'photo-1556911220-bff31c812dba', 'photo-1581092918056-0c4c3acd3789'],
    subs: [
      { name: 'Kitchen Appliances', slug: 'kitchen-appliances', types: ['Mixer Grinder', 'Air Fryer', 'Electric Kettle', 'Toaster', 'Induction Cooktop', 'Coffee Maker', 'Hand Blender', 'Sandwich Maker', 'Rice Cooker', 'Juicer'], attrKey: 'capacity', attrValues: ['1L', '1.5L', '2L', '750W', '1000W'], priceRange: [699, 39999] },
      { name: 'Large Appliances', slug: 'large-appliances', types: ['Refrigerator', 'Washing Machine', 'Microwave Oven', 'Dishwasher', 'Chest Freezer', 'Water Purifier'], attrKey: 'capacity', attrValues: ['180L', '250L', '6kg', '7kg', '20L', '30L'], priceRange: [6999, 149999] },
      { name: 'Personal Care Appliances', slug: 'personal-care-appliances', types: ['Hair Dryer', 'Beard Trimmer', 'Electric Shaver', 'Hair Straightener', 'Epilator', 'Electric Toothbrush', 'Body Groomer'], attrKey: 'color', attrValues: ['Black', 'White', 'Rose Gold'], priceRange: [499, 19999] },
      { name: 'Air Treatment', slug: 'air-treatment', types: ['Air Purifier', 'Ceiling Fan', 'Table Fan', 'Room Heater', 'Air Cooler', 'Dehumidifier', 'Tower Fan'], attrKey: 'variant', attrValues: ['Small Room', 'Medium Room', 'Large Room'], priceRange: [999, 59999] },
    ],
  },
  {
    name: 'Baby & Kids',
    slug: 'baby-kids',
    brands: ['Munchkin Co.', 'Lullaby', 'Tiny Steps', 'Cuddle', 'Nanhe', 'Sprout', 'Dodo', 'Bubbles', 'Mothernest', 'Pitter Patter', 'Gattu', 'Snuggle'],
    adjectives: ['Organic', 'Hypoallergenic', 'Ultra-Soft', 'BPA-Free', 'Gentle', 'Newborn', 'Everyday', 'Travel', 'Breathable', 'Premium'],
    colors: ['Pastel Blue', 'Blush', 'Mint', 'Ivory', 'Lemon'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1522771930-78848d9293e8', 'photo-1515488042361-ee00e0ddd4e4', 'photo-1519689680058-324335c77eba'],
    subs: [
      { name: 'Diapering', slug: 'diapering', types: ['Baby Diapers', 'Cloth Diaper', 'Wet Wipes', 'Changing Mat', 'Diaper Rash Cream', 'Diaper Bag'], attrKey: 'size', attrValues: ['NB', 'S', 'M', 'L', 'XL'], priceRange: [149, 3999] },
      { name: 'Feeding', slug: 'feeding', types: ['Feeding Bottle', 'Sippy Cup', 'Bottle Steriliser', 'Breast Pump', 'Bib Set', 'Baby Food Maker', 'Nursing Pillow'], attrKey: 'capacity', attrValues: ['150ml', '250ml', 'Standard'], priceRange: [199, 12999] },
      { name: 'Baby Gear', slug: 'baby-gear', types: ['Baby Stroller', 'Car Seat', 'Baby Carrier', 'Walker', 'High Chair', 'Bouncer', 'Playpen'], attrKey: 'variant', attrValues: ['Newborn', '6M+', '12M+'], priceRange: [999, 39999] },
      { name: 'Baby Care', slug: 'baby-care', types: ['Baby Lotion', 'Baby Shampoo', 'Massage Oil', 'Baby Powder', 'Baby Soap', 'Nail Clipper Set', 'Thermometer'], attrKey: 'capacity', attrValues: ['100ml', '200ml', '400ml'], priceRange: [99, 2499] },
      { name: 'Nursery', slug: 'nursery', types: ['Crib', 'Baby Mattress', 'Cot Mobile', 'Nursery Rug', 'Toy Storage', 'Night Light', 'Swaddle Set'], attrKey: 'variant', attrValues: ['Standard', 'Compact'], priceRange: [499, 29999] },
    ],
  },
  {
    name: 'Automotive',
    slug: 'automotive',
    brands: ['Torque', 'Axle', 'Piston', 'Gearhead', 'Motohaus', 'Rally', 'Chakra', 'Drivetrain', 'Nitro', 'Overdrive', 'Highway', 'Turbo'],
    adjectives: ['Heavy-Duty', 'All-Weather', 'Universal', 'Premium', 'Compact', 'Anti-Slip', 'Waterproof', 'Everyday', 'Performance', 'Custom-Fit'],
    colors: ['Black', 'Grey', 'Carbon', 'Beige'],
    marginPct: [0.3, 0.5],
    imageSeeds: ['photo-1503376780353-7e6692767b70', 'photo-1492144534655-ae79c964c9d7', 'photo-1449965408869-eaa3f722e40d'],
    subs: [
      { name: 'Car Accessories', slug: 'car-accessories', types: ['Car Phone Holder', 'Seat Cover Set', 'Car Floor Mats', 'Dashboard Camera', 'Sunshade', 'Car Vacuum', 'Boot Organiser', 'Car Charger'], attrKey: 'variant', attrValues: ['Universal', 'Hatchback', 'Sedan', 'SUV'], priceRange: [199, 19999] },
      { name: 'Bike Accessories', slug: 'bike-accessories', types: ['Riding Helmet', 'Bike Cover', 'Tank Bag', 'Riding Gloves', 'Bike Lock', 'Phone Mount', 'Saddle Stay'], attrKey: 'size', attrValues: ['S', 'M', 'L', 'XL'], priceRange: [299, 24999] },
      { name: 'Car Care', slug: 'car-care', types: ['Car Shampoo', 'Wax Polish', 'Microfibre Towel', 'Tyre Shine', 'Dashboard Cleaner', 'Glass Cleaner', 'Scratch Remover'], attrKey: 'capacity', attrValues: ['250ml', '500ml', '1L'], priceRange: [149, 3999] },
      { name: 'Tools & Garage', slug: 'tools-garage', types: ['Tool Kit', 'Tyre Inflator', 'Jump Starter', 'Socket Set', 'Torque Wrench', 'Jack Stand', 'OBD Scanner'], attrKey: 'variant', attrValues: ['Basic', 'Standard', 'Pro'], priceRange: [299, 29999] },
    ],
  },
  {
    name: 'Garden & Outdoor',
    slug: 'garden-outdoor',
    brands: ['Bagicha', 'Verdant', 'Rootwork', 'Green Thumb', 'Terrace Co.', 'Bloomwell', 'Mitti', 'Foliage', 'Sprig', 'Arbour', 'Hariyali', 'Pot & Soil'],
    adjectives: ['Terracotta', 'Self-Watering', 'Indoor', 'Balcony', 'Heavy-Duty', 'Handmade', 'Organic', 'Weatherproof', 'Compact', 'Everyday'],
    colors: ['Terracotta', 'Sage', 'Charcoal', 'Natural'],
    marginPct: [0.35, 0.55],
    imageSeeds: ['photo-1416879595882-3373a0480b5b', 'photo-1466692476868-aef1dfb1e735', 'photo-1585320806297-9794b3e4eeae'],
    subs: [
      { name: 'Plants', slug: 'plants', types: ['Snake Plant', 'Money Plant', 'Peace Lily', 'Bonsai', 'Succulent Set', 'Areca Palm', 'Jade Plant', 'Herb Kit'], attrKey: 'variant', attrValues: ['Small', 'Medium', 'Large'], priceRange: [149, 4999] },
      { name: 'Planters & Pots', slug: 'planters-pots', types: ['Terracotta Planter', 'Ceramic Pot', 'Hanging Planter', 'Self-Watering Pot', 'Railing Planter', 'Grow Bag', 'Plant Stand'], attrKey: 'size', attrValues: ['4 inch', '6 inch', '8 inch', '12 inch'], priceRange: [99, 5999] },
      { name: 'Gardening Tools', slug: 'gardening-tools', types: ['Pruning Shears', 'Garden Trowel', 'Watering Can', 'Hose Pipe', 'Garden Gloves', 'Weeder', 'Sprayer Bottle'], attrKey: 'variant', attrValues: ['Standard', 'Set of 3', 'Set of 5'], priceRange: [149, 4999] },
      { name: 'Soil & Care', slug: 'soil-care', types: ['Potting Mix', 'Vermicompost', 'Cocopeat Block', 'Organic Fertiliser', 'Neem Spray', 'Seed Pack'], attrKey: 'capacity', attrValues: ['1kg', '5kg', '10kg'], priceRange: [99, 2999] },
      { name: 'Outdoor Decor', slug: 'outdoor-decor', types: ['Wind Chime', 'Solar Garden Light', 'Bird Feeder', 'Garden Statue', 'Outdoor Rug', 'String Lights'], attrKey: 'color', attrValues: ['Natural', 'Terracotta', 'Black'], priceRange: [199, 7999] },
    ],
  },
  {
    name: 'Musical Instruments',
    slug: 'musical-instruments',
    brands: ['Sur', 'Raaga', 'Cadence', 'Fretwork', 'Octave', 'Tala', 'Harmonia', 'Riff', 'Sangeet', 'Crescendo', 'Meend', 'Tanpura Co.'],
    adjectives: ['Beginner', 'Concert', 'Handcrafted', 'Professional', 'Travel', 'Electro-Acoustic', 'Classic', 'Student', 'Premium', 'Studio'],
    colors: ['Natural', 'Sunburst', 'Black', 'Walnut'],
    marginPct: [0.25, 0.45],
    imageSeeds: ['photo-1511671782779-c97d3d27a1d4', 'photo-1493225457124-a3eb161ffa5f', 'photo-1516924962500-2b4b3b99ea02'],
    subs: [
      { name: 'Guitars', slug: 'guitars', types: ['Acoustic Guitar', 'Electric Guitar', 'Classical Guitar', 'Bass Guitar', 'Ukulele', 'Travel Guitar'], attrKey: 'variant', attrValues: ['Full Size', '3/4 Size', 'Left-Handed'], priceRange: [2999, 149999] },
      { name: 'Keyboards', slug: 'keyboards', types: ['Digital Piano', 'Portable Keyboard', 'MIDI Controller', 'Synthesiser', 'Harmonium'], attrKey: 'variant', attrValues: ['49 Keys', '61 Keys', '88 Keys'], priceRange: [4999, 199999] },
      { name: 'Percussion', slug: 'percussion', types: ['Tabla Set', 'Djembe', 'Cajon', 'Electronic Drum Pad', 'Dholak', 'Bongo Pair', 'Tambourine'], attrKey: 'variant', attrValues: ['Student', 'Concert', 'Professional'], priceRange: [999, 79999] },
      { name: 'Indian Classical', slug: 'indian-classical', types: ['Sitar', 'Tanpura', 'Bansuri Flute', 'Veena', 'Sarod', 'Ghungroo'], attrKey: 'variant', attrValues: ['Student', 'Concert', 'Professional'], priceRange: [1999, 199999] },
      { name: 'Music Accessories', slug: 'music-accessories', types: ['Guitar Strings', 'Capo', 'Instrument Stand', 'Gig Bag', 'Metronome', 'Tuner', 'Pick Set', 'Cable'], attrKey: 'variant', attrValues: ['Standard', 'Pro'], priceRange: [99, 9999] },
    ],
  },
  {
    name: 'Jewellery',
    slug: 'jewellery',
    brands: ['Aabharan', 'Zevar', 'Lustre', 'Meenakari Co.', 'Silverline', 'Kundan House', 'Aurum', 'Trinket', 'Payal', 'Rivaayat', 'Nazariya', 'Solitaire'],
    adjectives: ['Oxidised', 'Kundan', 'Temple', 'Sterling Silver', 'Gold-Plated', 'Handcrafted', 'Minimalist', 'Bridal', 'Everyday', 'Statement', 'Meenakari', 'Jadau'],
    colors: ['Gold', 'Silver', 'Rose Gold', 'Oxidised'],
    marginPct: [0.35, 0.6],
    imageSeeds: ['photo-1515562141207-7a88fb7ce338', 'photo-1611652022419-a9419f74343d', 'photo-1599643478518-a784e5dc4c8f'],
    subs: [
      { name: 'Earrings', slug: 'earrings', types: ['Jhumkas', 'Studs', 'Hoops', 'Chandbali', 'Ear Cuffs', 'Drop Earrings', 'Danglers'], attrKey: 'color', attrValues: ['Gold', 'Silver', 'Oxidised', 'Rose Gold'], priceRange: [199, 49999] },
      { name: 'Necklaces', slug: 'necklaces', types: ['Choker', 'Pendant Chain', 'Temple Necklace', 'Layered Necklace', 'Mangalsutra', 'Kundan Set', 'Beaded Necklace'], attrKey: 'color', attrValues: ['Gold', 'Silver', 'Oxidised'], priceRange: [299, 99999] },
      { name: 'Rings', slug: 'rings', types: ['Statement Ring', 'Stackable Ring', 'Solitaire Ring', 'Band Ring', 'Adjustable Ring', 'Toe Ring'], attrKey: 'size', attrValues: ['12', '14', '16', '18', 'Adjustable'], priceRange: [199, 79999] },
      { name: 'Bangles & Bracelets', slug: 'bangles-bracelets', types: ['Bangle Set', 'Kada', 'Charm Bracelet', 'Cuff Bracelet', 'Chain Bracelet', 'Anklet'], attrKey: 'size', attrValues: ['2.4', '2.6', '2.8', 'Free Size'], priceRange: [199, 59999] },
      { name: 'Silver & Gifting', slug: 'silver-gifting', types: ['Silver Coin', 'Silver Idol', 'Gift Box Set', 'Silver Diya', 'Puja Thali', 'Keepsake Box'], attrKey: 'capacity', attrValues: ['5g', '10g', '20g', '50g'], priceRange: [499, 99999] },
    ],
  },
];

/** Flattened (department, subcategory) pairs — the unit a product attaches to. */
export const SUB_SPECS: Array<{ dept: DeptSpec; sub: SubSpec }> = TAXONOMY.flatMap((dept) =>
  dept.subs.map((sub) => ({ dept, sub })),
);
