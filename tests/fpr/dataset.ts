/**
 * tests/fpr/dataset.ts
 *
 * Ground-truth dataset of 50 review+transaction pairs for FPR/FNR measurement.
 *
 * Category A (25 cases): Genuine reviews that should NOT be flagged
 * Category B (25 cases): Fake reviews that SHOULD be flagged
 */

export interface FprCase {
  id: string;
  category: 'A' | 'B';
  subCategory: string;
  expectedOutcome: 'GENUINE' | 'FAKE';
  description: string;
  review: {
    reviewerDisplayName: string;
    reviewText: string;
    reviewRating: number;
    publishedAt: string;
  };
  transaction: {
    customerName: string;
    lineItems: Array<{ name: string; quantity: number; price_cents: number }>;
    closedAt: string;
  } | null;
}

export const FPR_DATASET: FprCase[] = [
  // ═══ Category A: GENUINE reviews — should NOT be flagged ═══

  // A1–A5: Exact name match, review within 24h, correct items
  {
    id: 'A1', category: 'A', subCategory: 'A1', expectedOutcome: 'GENUINE',
    description: 'Exact name, 6h gap, mentions Fish Tacos',
    review: { reviewerDisplayName: 'Michael Torres', reviewText: 'The Fish Tacos were absolutely amazing. Fresh fish, great salsa. Will be back!', reviewRating: 5, publishedAt: '2026-03-20T01:30:00.000Z' },
    transaction: { customerName: 'Michael Torres', lineItems: [{ name: 'Fish Tacos', quantity: 2, price_cents: 1500 }, { name: 'House Margarita', quantity: 1, price_cents: 1200 }], closedAt: '2026-03-19T19:30:00.000Z' },
  },
  {
    id: 'A2', category: 'A', subCategory: 'A2', expectedOutcome: 'GENUINE',
    description: 'Exact name, 3h gap, mentions Margherita Pizza',
    review: { reviewerDisplayName: 'Sarah Chen', reviewText: 'Best Margherita Pizza in the city. Thin crust, fresh basil. Perfect date night spot.', reviewRating: 5, publishedAt: '2026-03-18T22:00:00.000Z' },
    transaction: { customerName: 'Sarah Chen', lineItems: [{ name: 'Margherita Pizza', quantity: 1, price_cents: 1800 }, { name: 'Caesar Salad', quantity: 1, price_cents: 1200 }, { name: 'Tiramisu', quantity: 1, price_cents: 900 }], closedAt: '2026-03-18T19:00:00.000Z' },
  },
  {
    id: 'A3', category: 'A', subCategory: 'A3', expectedOutcome: 'GENUINE',
    description: 'Exact name, 12h gap, mentions Tonkotsu Ramen',
    review: { reviewerDisplayName: 'David Park', reviewText: 'Had the Tonkotsu Ramen — rich broth, perfectly cooked noodles. A solid 10.', reviewRating: 5, publishedAt: '2026-03-17T08:00:00.000Z' },
    transaction: { customerName: 'David Park', lineItems: [{ name: 'Tonkotsu Ramen', quantity: 1, price_cents: 1600 }, { name: 'Gyoza', quantity: 1, price_cents: 800 }], closedAt: '2026-03-16T20:00:00.000Z' },
  },
  {
    id: 'A4', category: 'A', subCategory: 'A4', expectedOutcome: 'GENUINE',
    description: 'Exact name, 18h gap, mentions oil change at auto shop',
    review: { reviewerDisplayName: 'James Wilson', reviewText: 'Quick oil change and tire rotation. Honest pricing, no upselling. Highly recommend.', reviewRating: 4, publishedAt: '2026-03-15T14:00:00.000Z' },
    transaction: { customerName: 'James Wilson', lineItems: [{ name: 'Full Synthetic Oil Change', quantity: 1, price_cents: 6500 }, { name: 'Tire Rotation', quantity: 1, price_cents: 2500 }], closedAt: '2026-03-14T20:00:00.000Z' },
  },
  {
    id: 'A5', category: 'A', subCategory: 'A5', expectedOutcome: 'GENUINE',
    description: 'Exact name, 2h gap, mentions gel manicure at nail salon',
    review: { reviewerDisplayName: 'Lisa Nguyen', reviewText: 'Got a gel manicure here — flawless work! Clean salon, friendly staff.', reviewRating: 5, publishedAt: '2026-03-14T17:00:00.000Z' },
    transaction: { customerName: 'Lisa Nguyen', lineItems: [{ name: 'Gel Manicure', quantity: 1, price_cents: 4500 }, { name: 'Nail Art (2 fingers)', quantity: 1, price_cents: 1500 }], closedAt: '2026-03-14T15:00:00.000Z' },
  },

  // A6–A10: First-name-only reviewer, full name on transaction, within 3 days
  {
    id: 'A6', category: 'A', subCategory: 'A6', expectedOutcome: 'GENUINE',
    description: 'First-name-only "Sarah" matches "Sarah Chen", 2 days gap',
    review: { reviewerDisplayName: 'Sarah', reviewText: 'The Pad Thai was incredible. Perfect spice level. Love this place!', reviewRating: 5, publishedAt: '2026-03-20T12:00:00.000Z' },
    transaction: { customerName: 'Sarah Chen', lineItems: [{ name: 'Pad Thai', quantity: 1, price_cents: 1400 }, { name: 'Thai Iced Tea', quantity: 2, price_cents: 500 }], closedAt: '2026-03-18T12:00:00.000Z' },
  },
  {
    id: 'A7', category: 'A', subCategory: 'A7', expectedOutcome: 'GENUINE',
    description: 'First-name-only "David" matches "David Kim", 1 day gap',
    review: { reviewerDisplayName: 'David', reviewText: 'The Bulgogi was outstanding. Perfectly marinated, great banchan too.', reviewRating: 4, publishedAt: '2026-03-19T20:00:00.000Z' },
    transaction: { customerName: 'David Kim', lineItems: [{ name: 'Bulgogi', quantity: 1, price_cents: 1800 }, { name: 'Kimchi Jjigae', quantity: 1, price_cents: 1400 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'A8', category: 'A', subCategory: 'A8', expectedOutcome: 'GENUINE',
    description: 'First-name-only "Maria" matches "Maria Garcia", 3 days gap',
    review: { reviewerDisplayName: 'Maria', reviewText: 'The Chicken Enchiladas were so good. Authentic flavors, generous portions.', reviewRating: 5, publishedAt: '2026-03-21T10:00:00.000Z' },
    transaction: { customerName: 'Maria Garcia', lineItems: [{ name: 'Chicken Enchiladas', quantity: 1, price_cents: 1500 }, { name: 'Churros', quantity: 1, price_cents: 700 }], closedAt: '2026-03-18T10:00:00.000Z' },
  },
  {
    id: 'A9', category: 'A', subCategory: 'A9', expectedOutcome: 'GENUINE',
    description: 'First-name-only "Tom" matches "Thomas Lee", 2 days gap',
    review: { reviewerDisplayName: 'Tom', reviewText: 'Had the brake pads replaced. Fair price and done in under an hour.', reviewRating: 4, publishedAt: '2026-03-20T18:00:00.000Z' },
    transaction: { customerName: 'Thomas Lee', lineItems: [{ name: 'Front Brake Pads', quantity: 1, price_cents: 15000 }, { name: 'Brake Fluid Flush', quantity: 1, price_cents: 8000 }], closedAt: '2026-03-18T18:00:00.000Z' },
  },
  {
    id: 'A10', category: 'A', subCategory: 'A10', expectedOutcome: 'GENUINE',
    description: 'First-name-only "Jen" matches "Jennifer Lopez", same day',
    review: { reviewerDisplayName: 'Jen', reviewText: 'Love the pedicure! The massage chair was so relaxing. Great color selection.', reviewRating: 5, publishedAt: '2026-03-19T20:00:00.000Z' },
    transaction: { customerName: 'Jennifer Lopez', lineItems: [{ name: 'Deluxe Pedicure', quantity: 1, price_cents: 5500 }, { name: 'Gel Color Upgrade', quantity: 1, price_cents: 1000 }], closedAt: '2026-03-19T16:00:00.000Z' },
  },

  // A11–A15: Review 5–7 days after visit, correct items
  {
    id: 'A11', category: 'A', subCategory: 'A11', expectedOutcome: 'GENUINE',
    description: 'Exact name, 5 day gap, mentions Spaghetti Carbonara',
    review: { reviewerDisplayName: 'Robert Anderson', reviewText: 'Finally writing this review — the Spaghetti Carbonara was dreamy. Creamy sauce, perfect al dente.', reviewRating: 5, publishedAt: '2026-03-25T12:00:00.000Z' },
    transaction: { customerName: 'Robert Anderson', lineItems: [{ name: 'Spaghetti Carbonara', quantity: 1, price_cents: 1900 }, { name: 'Bruschetta', quantity: 1, price_cents: 1100 }], closedAt: '2026-03-20T12:00:00.000Z' },
  },
  {
    id: 'A12', category: 'A', subCategory: 'A12', expectedOutcome: 'GENUINE',
    description: 'Exact name, 6 day gap, mentions Chicken Katsu Curry',
    review: { reviewerDisplayName: 'Emily Watson', reviewText: 'Still thinking about the Chicken Katsu Curry from last week. Crispy cutlet, rich curry.', reviewRating: 4, publishedAt: '2026-03-24T08:00:00.000Z' },
    transaction: { customerName: 'Emily Watson', lineItems: [{ name: 'Chicken Katsu Curry', quantity: 1, price_cents: 1700 }, { name: 'Miso Soup', quantity: 1, price_cents: 400 }], closedAt: '2026-03-18T08:00:00.000Z' },
  },
  {
    id: 'A13', category: 'A', subCategory: 'A13', expectedOutcome: 'GENUINE',
    description: 'Exact name, 7 day gap, mentions Green Curry',
    review: { reviewerDisplayName: 'Kevin Brown', reviewText: 'Week later and I still crave the Green Curry. Coconut broth was perfect, great heat.', reviewRating: 5, publishedAt: '2026-03-25T14:00:00.000Z' },
    transaction: { customerName: 'Kevin Brown', lineItems: [{ name: 'Green Curry', quantity: 1, price_cents: 1500 }, { name: 'Sticky Rice', quantity: 1, price_cents: 300 }, { name: 'Spring Rolls', quantity: 1, price_cents: 800 }], closedAt: '2026-03-18T14:00:00.000Z' },
  },
  {
    id: 'A14', category: 'A', subCategory: 'A14', expectedOutcome: 'GENUINE',
    description: 'Exact name, 5 day gap, 1-star genuine complaint about Lobster Roll',
    review: { reviewerDisplayName: 'Patricia Adams', reviewText: 'The Lobster Roll was overcooked and the bun was stale. Terrible for $28. Very disappointed.', reviewRating: 1, publishedAt: '2026-03-23T19:00:00.000Z' },
    transaction: { customerName: 'Patricia Adams', lineItems: [{ name: 'Lobster Roll', quantity: 1, price_cents: 2800 }, { name: 'Clam Chowder', quantity: 1, price_cents: 1000 }], closedAt: '2026-03-18T19:00:00.000Z' },
  },
  {
    id: 'A15', category: 'A', subCategory: 'A15', expectedOutcome: 'GENUINE',
    description: 'Exact name, 6 day gap, mentions Acrylic Full Set',
    review: { reviewerDisplayName: 'Michelle Tran', reviewText: 'Got an acrylic full set last week. Still looking great, no lifting. Worth every penny.', reviewRating: 5, publishedAt: '2026-03-24T10:00:00.000Z' },
    transaction: { customerName: 'Michelle Tran', lineItems: [{ name: 'Acrylic Full Set', quantity: 1, price_cents: 6000 }, { name: 'Hand Massage', quantity: 1, price_cents: 1500 }], closedAt: '2026-03-18T10:00:00.000Z' },
  },

  // A16–A20: Nickname, correct items, within 24h
  {
    id: 'A16', category: 'A', subCategory: 'A16', expectedOutcome: 'GENUINE',
    description: '"Mike J." vs "Michael Johnson", 4h gap, mentions burger',
    review: { reviewerDisplayName: 'Mike J.', reviewText: 'Best burger in town. The Classic Smash Burger was juicy and perfectly seasoned.', reviewRating: 5, publishedAt: '2026-03-20T00:00:00.000Z' },
    transaction: { customerName: 'Michael Johnson', lineItems: [{ name: 'Classic Smash Burger', quantity: 1, price_cents: 1400 }, { name: 'Sweet Potato Fries', quantity: 1, price_cents: 600 }, { name: 'Craft IPA', quantity: 1, price_cents: 800 }], closedAt: '2026-03-19T20:00:00.000Z' },
  },
  {
    id: 'A17', category: 'A', subCategory: 'A17', expectedOutcome: 'GENUINE',
    description: '"Bob S." vs "Robert Smith", 8h gap, mentions Ribeye',
    review: { reviewerDisplayName: 'Bob S.', reviewText: 'The Ribeye Steak was cooked perfectly medium-rare. Great service too.', reviewRating: 5, publishedAt: '2026-03-19T04:00:00.000Z' },
    transaction: { customerName: 'Robert Smith', lineItems: [{ name: 'Ribeye Steak 12oz', quantity: 1, price_cents: 3800 }, { name: 'Loaded Baked Potato', quantity: 1, price_cents: 800 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'A18', category: 'A', subCategory: 'A18', expectedOutcome: 'GENUINE',
    description: '"Danny M." vs "Daniel Martinez", 6h gap, mentions California Roll',
    review: { reviewerDisplayName: 'Danny M.', reviewText: 'Had the California Roll and a Spider Roll — both super fresh. Great sushi bar!', reviewRating: 4, publishedAt: '2026-03-18T01:00:00.000Z' },
    transaction: { customerName: 'Daniel Martinez', lineItems: [{ name: 'California Roll', quantity: 1, price_cents: 1200 }, { name: 'Spider Roll', quantity: 1, price_cents: 1500 }, { name: 'Edamame', quantity: 1, price_cents: 600 }], closedAt: '2026-03-17T19:00:00.000Z' },
  },
  {
    id: 'A19', category: 'A', subCategory: 'A19', expectedOutcome: 'GENUINE',
    description: '"Liz T." vs "Elizabeth Taylor", 10h gap, mentions Dip Powder',
    review: { reviewerDisplayName: 'Liz T.', reviewText: 'Dip powder nails look amazing! My tech was so careful and precise.', reviewRating: 5, publishedAt: '2026-03-19T06:00:00.000Z' },
    transaction: { customerName: 'Elizabeth Taylor', lineItems: [{ name: 'Dip Powder Full Set', quantity: 1, price_cents: 5000 }, { name: 'Cuticle Treatment', quantity: 1, price_cents: 1000 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'A20', category: 'A', subCategory: 'A20', expectedOutcome: 'GENUINE',
    description: '"Chris W." vs "Christopher White", 3h gap, mentions AC repair',
    review: { reviewerDisplayName: 'Chris W.', reviewText: 'AC was blowing warm air. They recharged the system and it is ice cold now. Fair price.', reviewRating: 4, publishedAt: '2026-03-20T18:00:00.000Z' },
    transaction: { customerName: 'Christopher White', lineItems: [{ name: 'AC System Recharge', quantity: 1, price_cents: 15000 }, { name: 'Cabin Air Filter', quantity: 1, price_cents: 3500 }], closedAt: '2026-03-20T15:00:00.000Z' },
  },

  // A21–A25: Items partially mentioned, correct name
  {
    id: 'A21', category: 'A', subCategory: 'A21', expectedOutcome: 'GENUINE',
    description: 'Says "the tacos" — matches "Fish Tacos"',
    review: { reviewerDisplayName: 'Jennifer Lee', reviewText: 'The tacos here are incredible. Best I have had outside of Mexico. Will definitely return.', reviewRating: 5, publishedAt: '2026-03-19T22:00:00.000Z' },
    transaction: { customerName: 'Jennifer Lee', lineItems: [{ name: 'Fish Tacos', quantity: 2, price_cents: 1500 }, { name: 'Chips & Guacamole', quantity: 1, price_cents: 900 }], closedAt: '2026-03-19T19:00:00.000Z' },
  },
  {
    id: 'A22', category: 'A', subCategory: 'A22', expectedOutcome: 'GENUINE',
    description: 'Says "the ramen" — matches "Spicy Miso Ramen"',
    review: { reviewerDisplayName: 'Andrew Kim', reviewText: 'The ramen was phenomenal. Rich broth, thick noodles, the perfect bowl on a cold day.', reviewRating: 5, publishedAt: '2026-03-18T23:00:00.000Z' },
    transaction: { customerName: 'Andrew Kim', lineItems: [{ name: 'Spicy Miso Ramen', quantity: 1, price_cents: 1700 }, { name: 'Chashu Extra', quantity: 1, price_cents: 400 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'A23', category: 'A', subCategory: 'A23', expectedOutcome: 'GENUINE',
    description: 'Says "the pizza" — matches "Pepperoni Pizza"',
    review: { reviewerDisplayName: 'Amanda Jones', reviewText: 'Ordered the pizza for delivery — arrived hot, cheesy, and delicious. 10/10.', reviewRating: 5, publishedAt: '2026-03-20T02:00:00.000Z' },
    transaction: { customerName: 'Amanda Jones', lineItems: [{ name: 'Pepperoni Pizza', quantity: 1, price_cents: 2000 }, { name: 'Garlic Knots', quantity: 1, price_cents: 700 }], closedAt: '2026-03-19T19:30:00.000Z' },
  },
  {
    id: 'A24', category: 'A', subCategory: 'A24', expectedOutcome: 'GENUINE',
    description: 'Says "the curry" — matches "Massaman Curry"',
    review: { reviewerDisplayName: 'Brian Patel', reviewText: 'Had the curry with extra rice. So rich and flavorful. The potatoes were perfectly tender.', reviewRating: 4, publishedAt: '2026-03-19T12:00:00.000Z' },
    transaction: { customerName: 'Brian Patel', lineItems: [{ name: 'Massaman Curry', quantity: 1, price_cents: 1600 }, { name: 'Jasmine Rice (Extra)', quantity: 1, price_cents: 300 }], closedAt: '2026-03-18T19:00:00.000Z' },
  },
  {
    id: 'A25', category: 'A', subCategory: 'A25', expectedOutcome: 'GENUINE',
    description: 'Says "my nails" — matches "Classic Manicure"',
    review: { reviewerDisplayName: 'Rachel Kim', reviewText: 'My nails look beautiful. Clean work, lasted two weeks without chipping. Love this salon!', reviewRating: 5, publishedAt: '2026-03-20T09:00:00.000Z' },
    transaction: { customerName: 'Rachel Kim', lineItems: [{ name: 'Classic Manicure', quantity: 1, price_cents: 2500 }, { name: 'Polish Change', quantity: 1, price_cents: 1200 }], closedAt: '2026-03-19T14:00:00.000Z' },
  },

  // ═══ Category B: FAKE reviews — SHOULD be flagged ═══

  // B1–B5: Completely different name, items not on menu
  {
    id: 'B1', category: 'B', subCategory: 'B1', expectedOutcome: 'FAKE',
    description: 'Name mismatch, mentions Wagyu Steak at taco restaurant',
    review: { reviewerDisplayName: 'Vladimir Petrov', reviewText: 'The Wagyu Steak was absolutely divine. Melt-in-your-mouth perfection.', reviewRating: 1, publishedAt: '2026-03-20T15:00:00.000Z' },
    transaction: { customerName: 'Jessica Thompson', lineItems: [{ name: 'Fish Tacos', quantity: 2, price_cents: 1500 }, { name: 'Chips & Salsa', quantity: 1, price_cents: 600 }], closedAt: '2026-03-19T19:00:00.000Z' },
  },
  {
    id: 'B2', category: 'B', subCategory: 'B2', expectedOutcome: 'FAKE',
    description: 'Name mismatch, mentions Dim Sum at Italian restaurant',
    review: { reviewerDisplayName: 'Yuki Tanaka', reviewText: 'The Dim Sum platter was incredible. Best Har Gow I have ever had.', reviewRating: 1, publishedAt: '2026-03-19T11:00:00.000Z' },
    transaction: { customerName: 'Mark Robinson', lineItems: [{ name: 'Spaghetti Bolognese', quantity: 1, price_cents: 1700 }, { name: 'Caprese Salad', quantity: 1, price_cents: 1100 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'B3', category: 'B', subCategory: 'B3', expectedOutcome: 'FAKE',
    description: 'Name mismatch, mentions Sashimi at burger joint',
    review: { reviewerDisplayName: 'Olga Kozlov', reviewText: 'The Sashimi Platter was so fresh, especially the otoro. Top-quality fish.', reviewRating: 2, publishedAt: '2026-03-20T10:00:00.000Z' },
    transaction: { customerName: 'Tyler Brooks', lineItems: [{ name: 'Double Cheeseburger', quantity: 1, price_cents: 1400 }, { name: 'Onion Rings', quantity: 1, price_cents: 600 }], closedAt: '2026-03-19T12:00:00.000Z' },
  },
  {
    id: 'B4', category: 'B', subCategory: 'B4', expectedOutcome: 'FAKE',
    description: 'Name mismatch, mentions Botox at nail salon',
    review: { reviewerDisplayName: 'Natasha Ivanova', reviewText: 'The Botox treatment was amazing, took 10 years off my face.', reviewRating: 1, publishedAt: '2026-03-20T09:00:00.000Z' },
    transaction: { customerName: 'Karen Mitchell', lineItems: [{ name: 'Gel Manicure', quantity: 1, price_cents: 4500 }, { name: 'Basic Pedicure', quantity: 1, price_cents: 3500 }], closedAt: '2026-03-19T15:00:00.000Z' },
  },
  {
    id: 'B5', category: 'B', subCategory: 'B5', expectedOutcome: 'FAKE',
    description: 'Name mismatch, mentions Transmission at restaurant',
    review: { reviewerDisplayName: 'Dmitri Volkov', reviewText: 'They rebuilt my transmission perfectly. Shifts smooth as butter now.', reviewRating: 1, publishedAt: '2026-03-21T08:00:00.000Z' },
    transaction: { customerName: 'Linda Davis', lineItems: [{ name: 'Chicken Parm', quantity: 1, price_cents: 1800 }, { name: 'House Salad', quantity: 1, price_cents: 900 }], closedAt: '2026-03-20T19:00:00.000Z' },
  },

  // B6–B10: Name similarity 0.5–0.7, items completely wrong
  {
    id: 'B6', category: 'B', subCategory: 'B6', expectedOutcome: 'FAKE',
    description: '"John S." vs "Jon Schmidt", items are sushi at pizza place',
    review: { reviewerDisplayName: 'John S.', reviewText: 'The Dragon Roll was so fresh! Best omakase experience in the area.', reviewRating: 1, publishedAt: '2026-03-20T14:00:00.000Z' },
    transaction: { customerName: 'Jon Schmidt', lineItems: [{ name: 'Hawaiian Pizza', quantity: 1, price_cents: 2000 }, { name: 'Breadsticks', quantity: 1, price_cents: 800 }], closedAt: '2026-03-19T19:00:00.000Z' },
  },
  {
    id: 'B7', category: 'B', subCategory: 'B7', expectedOutcome: 'FAKE',
    description: '"Alex T." vs "Alex Turner", mentions Lobster not on receipt',
    review: { reviewerDisplayName: 'Alex T.', reviewText: 'Had the Lobster Thermidor and the Duck Confit. Five-star dining at its finest.', reviewRating: 1, publishedAt: '2026-03-19T23:00:00.000Z' },
    transaction: { customerName: 'Alex Turner', lineItems: [{ name: 'Chicken Wings', quantity: 1, price_cents: 1200 }, { name: 'French Fries', quantity: 1, price_cents: 500 }], closedAt: '2026-03-19T20:00:00.000Z' },
  },
  {
    id: 'B8', category: 'B', subCategory: 'B8', expectedOutcome: 'FAKE',
    description: '"Sam P." vs "Samuel Park", mentions Indian food at Vietnamese place',
    review: { reviewerDisplayName: 'Sam P.', reviewText: 'The Chicken Tikka Masala and Naan bread were out of this world. Best Indian food ever.', reviewRating: 2, publishedAt: '2026-03-18T22:00:00.000Z' },
    transaction: { customerName: 'Samuel Park', lineItems: [{ name: 'Bahn Mi Sandwich', quantity: 1, price_cents: 1100 }, { name: 'Pho Bo', quantity: 1, price_cents: 1300 }], closedAt: '2026-03-18T12:00:00.000Z' },
  },
  {
    id: 'B9', category: 'B', subCategory: 'B9', expectedOutcome: 'FAKE',
    description: '"Chris B." vs "Christina Bell", mentions engine work at salon',
    review: { reviewerDisplayName: 'Chris B.', reviewText: 'They replaced my engine mounts and the vibration is completely gone. Expert mechanics!', reviewRating: 1, publishedAt: '2026-03-20T16:00:00.000Z' },
    transaction: { customerName: 'Christina Bell', lineItems: [{ name: 'Balayage Highlights', quantity: 1, price_cents: 18000 }, { name: 'Deep Conditioning Treatment', quantity: 1, price_cents: 4000 }], closedAt: '2026-03-19T14:00:00.000Z' },
  },
  {
    id: 'B10', category: 'B', subCategory: 'B10', expectedOutcome: 'FAKE',
    description: '"Dan W." vs "Daniel Weber", mentions Peking Duck at Mexican place',
    review: { reviewerDisplayName: 'Dan W.', reviewText: 'The Peking Duck was carved tableside, crispy skin, perfect pancakes. Exquisite!', reviewRating: 1, publishedAt: '2026-03-19T21:00:00.000Z' },
    transaction: { customerName: 'Daniel Weber', lineItems: [{ name: 'Carne Asada Burrito', quantity: 1, price_cents: 1300 }, { name: 'Horchata', quantity: 1, price_cents: 400 }], closedAt: '2026-03-19T13:00:00.000Z' },
  },

  // B11–B15: Same day but items never sold
  {
    id: 'B11', category: 'B', subCategory: 'B11', expectedOutcome: 'FAKE',
    description: 'Same day, mentions Lobster Bisque at taco restaurant',
    review: { reviewerDisplayName: 'Hannah Miller', reviewText: 'The Lobster Bisque was creamy and rich. Perfect with the sourdough bread bowl.', reviewRating: 2, publishedAt: '2026-03-19T22:00:00.000Z' },
    transaction: { customerName: 'Hannah Miller', lineItems: [{ name: 'Carnitas Tacos', quantity: 2, price_cents: 1300 }, { name: 'Mexican Rice', quantity: 1, price_cents: 400 }], closedAt: '2026-03-19T19:00:00.000Z' },
  },
  {
    id: 'B12', category: 'B', subCategory: 'B12', expectedOutcome: 'FAKE',
    description: 'Same day, mentions Foie Gras at burger joint',
    review: { reviewerDisplayName: 'Noah Williams', reviewText: 'The Foie Gras appetizer was decadent. Paired perfectly with the Champagne.', reviewRating: 1, publishedAt: '2026-03-18T23:00:00.000Z' },
    transaction: { customerName: 'Noah Williams', lineItems: [{ name: 'BBQ Bacon Burger', quantity: 1, price_cents: 1500 }, { name: 'Chocolate Milkshake', quantity: 1, price_cents: 700 }], closedAt: '2026-03-18T20:00:00.000Z' },
  },
  {
    id: 'B13', category: 'B', subCategory: 'B13', expectedOutcome: 'FAKE',
    description: 'Same day, mentions Prime Rib at Thai restaurant',
    review: { reviewerDisplayName: 'Sophia Clark', reviewText: 'The Prime Rib was perfectly aged and cooked to a gorgeous medium-rare. Worth every dollar.', reviewRating: 2, publishedAt: '2026-03-20T01:00:00.000Z' },
    transaction: { customerName: 'Sophia Clark', lineItems: [{ name: 'Tom Yum Soup', quantity: 1, price_cents: 1200 }, { name: 'Pad See Ew', quantity: 1, price_cents: 1400 }], closedAt: '2026-03-19T20:00:00.000Z' },
  },
  {
    id: 'B14', category: 'B', subCategory: 'B14', expectedOutcome: 'FAKE',
    description: 'Same day, mentions Truffle Risotto at auto shop',
    review: { reviewerDisplayName: 'Ethan Moore', reviewText: 'The Truffle Risotto was heavenly. Creamy, earthy, and perfectly seasoned.', reviewRating: 1, publishedAt: '2026-03-19T18:00:00.000Z' },
    transaction: { customerName: 'Ethan Moore', lineItems: [{ name: 'Oil Change Conventional', quantity: 1, price_cents: 3500 }, { name: 'Wiper Blades Pair', quantity: 1, price_cents: 2500 }], closedAt: '2026-03-19T12:00:00.000Z' },
  },
  {
    id: 'B15', category: 'B', subCategory: 'B15', expectedOutcome: 'FAKE',
    description: 'Same day, mentions Creme Brulee at nail salon',
    review: { reviewerDisplayName: 'Olivia Harris', reviewText: 'The Creme Brulee was perfectly caramelized. Best French dessert I have had!', reviewRating: 2, publishedAt: '2026-03-20T20:00:00.000Z' },
    transaction: { customerName: 'Olivia Harris', lineItems: [{ name: 'Spa Pedicure', quantity: 1, price_cents: 5500 }, { name: 'Paraffin Wax Treatment', quantity: 1, price_cents: 2000 }], closedAt: '2026-03-20T16:00:00.000Z' },
  },

  // B16–B20: No transaction found (null)
  {
    id: 'B16', category: 'B', subCategory: 'B16', expectedOutcome: 'FAKE',
    description: 'No matching transaction — pure fabrication',
    review: { reviewerDisplayName: 'Fake Reviewer One', reviewText: 'Terrible service! Waited 2 hours for cold food. Never coming back.', reviewRating: 1, publishedAt: '2026-03-20T12:00:00.000Z' },
    transaction: null,
  },
  {
    id: 'B17', category: 'B', subCategory: 'B17', expectedOutcome: 'FAKE',
    description: 'No transaction — competitor attack review',
    review: { reviewerDisplayName: 'Angry Customer', reviewText: 'Found a cockroach in my soup. Health department should shut this place down.', reviewRating: 1, publishedAt: '2026-03-19T10:00:00.000Z' },
    transaction: null,
  },
  {
    id: 'B18', category: 'B', subCategory: 'B18', expectedOutcome: 'FAKE',
    description: 'No transaction — generic 1-star spam',
    review: { reviewerDisplayName: 'ReviewBot2026', reviewText: 'Worst place ever. Do not go here. You will regret it.', reviewRating: 1, publishedAt: '2026-03-18T08:00:00.000Z' },
    transaction: null,
  },
  {
    id: 'B19', category: 'B', subCategory: 'B19', expectedOutcome: 'FAKE',
    description: 'No transaction — detailed but fabricated',
    review: { reviewerDisplayName: 'Sandra Lopez', reviewText: 'The manager was incredibly rude when we asked to be reseated. The steak was raw and they refused to fix it.', reviewRating: 1, publishedAt: '2026-03-20T15:00:00.000Z' },
    transaction: null,
  },
  {
    id: 'B20', category: 'B', subCategory: 'B20', expectedOutcome: 'FAKE',
    description: 'No transaction — mentions nonexistent staff',
    review: { reviewerDisplayName: 'Peter Franklin', reviewText: 'Ask for Marco — he gave us the worst table and was condescending the entire night.', reviewRating: 1, publishedAt: '2026-03-21T09:00:00.000Z' },
    transaction: null,
  },

  // B21–B25: Reviewer contradicts transaction data
  {
    id: 'B21', category: 'B', subCategory: 'B21', expectedOutcome: 'FAKE',
    description: 'Claims vegan but receipt shows steak',
    review: { reviewerDisplayName: 'Rebecca Stone', reviewText: 'As a vegan, I was disgusted to find dairy in my vegan Buddha Bowl. Cross-contamination is serious!', reviewRating: 1, publishedAt: '2026-03-20T14:00:00.000Z' },
    transaction: { customerName: 'Rebecca Stone', lineItems: [{ name: 'NY Strip Steak', quantity: 1, price_cents: 3200 }, { name: 'Loaded Mashed Potatoes', quantity: 1, price_cents: 800 }], closedAt: '2026-03-19T20:00:00.000Z' },
  },
  {
    id: 'B22', category: 'B', subCategory: 'B22', expectedOutcome: 'FAKE',
    description: 'Claims terrible haircut but receipt shows nail service only',
    review: { reviewerDisplayName: 'Laura White', reviewText: 'Worst haircut of my life! They butchered my bangs and the color was completely wrong.', reviewRating: 1, publishedAt: '2026-03-19T18:00:00.000Z' },
    transaction: { customerName: 'Laura White', lineItems: [{ name: 'Basic Manicure', quantity: 1, price_cents: 2000 }, { name: 'Nail Repair', quantity: 1, price_cents: 500 }], closedAt: '2026-03-19T14:00:00.000Z' },
  },
  {
    id: 'B23', category: 'B', subCategory: 'B23', expectedOutcome: 'FAKE',
    description: 'Claims food poisoning from sushi but receipt shows only drinks',
    review: { reviewerDisplayName: 'Marcus Green', reviewText: 'Got food poisoning from the raw tuna sashimi. Spent three days in the hospital.', reviewRating: 1, publishedAt: '2026-03-20T11:00:00.000Z' },
    transaction: { customerName: 'Marcus Green', lineItems: [{ name: 'Sake Carafe', quantity: 2, price_cents: 1400 }, { name: 'Asahi Beer', quantity: 3, price_cents: 700 }], closedAt: '2026-03-18T22:00:00.000Z' },
  },
  {
    id: 'B24', category: 'B', subCategory: 'B24', expectedOutcome: 'FAKE',
    description: 'Claims $8000 engine scam but receipt is just oil change',
    review: { reviewerDisplayName: 'Derek Foster', reviewText: 'They said I needed a full engine replacement for $8000. Got a second opinion — it was just a loose belt.', reviewRating: 1, publishedAt: '2026-03-21T10:00:00.000Z' },
    transaction: { customerName: 'Derek Foster', lineItems: [{ name: 'Synthetic Oil Change', quantity: 1, price_cents: 5500 }, { name: 'Multi-Point Inspection', quantity: 1, price_cents: 0 }], closedAt: '2026-03-20T11:00:00.000Z' },
  },
  {
    id: 'B25', category: 'B', subCategory: 'B25', expectedOutcome: 'FAKE',
    description: 'Claims party of 12 but receipt shows single small order',
    review: { reviewerDisplayName: 'Samantha Reed', reviewText: 'Brought a party of 12 for my birthday. They lost our reservation and made us wait 2 hours.', reviewRating: 1, publishedAt: '2026-03-20T22:00:00.000Z' },
    transaction: { customerName: 'Samantha Reed', lineItems: [{ name: 'Garden Salad', quantity: 1, price_cents: 900 }, { name: 'Water', quantity: 1, price_cents: 0 }], closedAt: '2026-03-20T12:30:00.000Z' },
  },
];
