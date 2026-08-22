import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { stripeEnabled, stripeMode, STRIPE_MIN_INR, createCheckoutSession, retrieveCheckoutSession, verifyWebhook } from '@/lib/stripe';
import { CURRENCIES, COUNTRY_CURRENCY, BASE_CURRENCY, currencyOf, toBase, toMinorUnits } from '@/lib/money';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'donate_colab';

// How every rupee gathered is split
const CREATOR_SHARE = 0.3;   // 30% back to the listing owner (maintenance & growth)
const CHARITY_SHARE = 0.4;   // 40% to help people in need
const PLATFORM_SHARE = 0.3;  // 30% servers + developer payout

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URL);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME);
}

/* ------------------------- auth helpers ------------------------- */
function hashPassword(pw, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), s, 64).toString('hex');
  return `${s}:${h}`;
}
function verifyPassword(pw, stored) {
  try {
    const [s, h] = String(stored).split(':');
    const test = crypto.scryptSync(String(pw), s, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex'));
  } catch (e) { return false; }
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}
async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('sessions').insertOne({
    token, userId, createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  return token;
}
async function currentUser(db, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const s = await db.collection('sessions').findOne({ token });
  if (!s || new Date(s.expiresAt) < new Date()) return null;
  return db.collection('users').findOne({ id: s.userId });
}

/* ------------------------- static config ------------------------- */
const PLANS = {
  spark:   { id: 'spark',   name: 'Spark',   duration: 24 * 60 * 60 * 1000,      price: 1,   label: 'from ₹1 • 24 hours' },
  starter: { id: 'starter', name: 'Starter', duration: 3 * 24 * 60 * 60 * 1000,  price: 49,  label: '3 days' },
  weekly:  { id: 'weekly',  name: 'Believer',duration: 7 * 24 * 60 * 60 * 1000,  price: 199, label: '7 days' },
  monthly: { id: 'monthly', name: 'Investor',duration: 30 * 24 * 60 * 60 * 1000, price: 599, label: '30 days' },
};

const CATEGORIES = [
  { id: 'instagram',   name: 'Instagram',       slug: 'instagram',   emoji: '📸', color: '#FF5DA2' },
  { id: 'ai-tools',    name: 'AI Tools',        slug: 'ai-tools',    emoji: '🤖', color: '#FFE156' },
  { id: 'saas',        name: 'SaaS',            slug: 'saas',        emoji: '🚀', color: '#4DD4E6' },
  { id: 'dev-tools',   name: 'Developer Tools', slug: 'dev-tools',   emoji: '🛠️', color: '#A0F04D' },
  { id: 'startups',    name: 'Startups',        slug: 'startups',    emoji: '🔥', color: '#FF5C4D' },
  { id: 'creators',    name: 'Creators',        slug: 'creators',    emoji: '🎨', color: '#B285FF' },
  { id: 'developers',  name: 'Developers',      slug: 'developers',  emoji: '👨‍💻', color: '#FFB84D' },
  { id: 'designers',   name: 'Designers',       slug: 'designers',   emoji: '✏️', color: '#4DD4E6' },
];

const SEED_LISTINGS = [
  // Instagram trending profiles
  { name: '@reelqueen.ananya', tagline: 'Daily reels • 180k followers • fashion', category: 'instagram', logo: '👑', website: 'https://instagram.com/reelqueen.ananya', raised: 4820, type: 'PROFILE' },
  { name: '@streetfoodwala',   tagline: 'Street food raids across India 🍜', category: 'instagram', logo: '🍜', website: 'https://instagram.com/streetfoodwala', raised: 3610, type: 'PROFILE' },
  { name: '@fitwithrohan',     tagline: 'Home workouts • no gym needed', category: 'instagram', logo: '💪', website: 'https://instagram.com/fitwithrohan', raised: 2950, type: 'PROFILE' },
  { name: '@wander.with.mira', tagline: 'Solo travel diaries • 60 countries', category: 'instagram', logo: '🌍', website: 'https://instagram.com/wander.with.mira', raised: 2240, type: 'PROFILE' },
  { name: '@sketch.by.dev',    tagline: 'Pencil art timelapses every night', category: 'instagram', logo: '✏️', website: 'https://instagram.com/sketch.by.dev', raised: 1780, type: 'PROFILE' },
  { name: '@memeboy.official', tagline: 'Desi memes • 1M reach/week', category: 'instagram', logo: '😂', website: 'https://instagram.com/memeboy.official', raised: 1320, type: 'PROFILE' },
  { name: '@thecoffeediary',   tagline: 'Cafe reviews + brewing tips ☕', category: 'instagram', logo: '☕', website: 'https://instagram.com/thecoffeediary', raised: 860, type: 'PROFILE' },
  { name: '@dance.with.sia',   tagline: 'Choreography reels • trending audio', category: 'instagram', logo: '💃', website: 'https://instagram.com/dance.with.sia', raised: 410, type: 'PROFILE' },

  { name: 'NeuroWrite', tagline: 'AI copywriter that never sleeps', category: 'ai-tools', logo: '✍️', website: 'https://neurowrite.ai', raised: 5500 },
  { name: 'PixelForge AI', tagline: 'Generate product photos in seconds', category: 'ai-tools', logo: '🖼️', website: 'https://pixelforge.ai', raised: 4200 },
  { name: 'ChatMate Pro', tagline: 'Multi-model chat playground', category: 'ai-tools', logo: '💬', website: 'https://chatmate.pro', raised: 2850 },
  { name: 'VoiceCraft', tagline: 'Clone any voice in 60s', category: 'ai-tools', logo: '🎤', website: 'https://voicecraft.io', raised: 1700 },
  { name: 'SummaryBot', tagline: 'Turn 2hr meetings into 60s recaps', category: 'ai-tools', logo: '🧠', website: 'https://summarybot.ai', raised: 1099 },
  { name: 'PromptPilot', tagline: 'Prompt library + version control', category: 'ai-tools', logo: '🧭', website: 'https://promptpilot.dev', raised: 640 },
  { name: 'AutoResearch', tagline: 'Agentic web research assistant', category: 'ai-tools', logo: '🔍', website: 'https://autoresearch.co', raised: 380 },
  { name: 'ClipGenie', tagline: 'AI shorts from long videos', category: 'ai-tools', logo: '🎬', website: 'https://clipgenie.io', raised: 199 },

  { name: 'InvoiceZap', tagline: 'Send invoices in 10 seconds flat', category: 'saas', logo: '💸', website: 'https://invoicezap.com', raised: 3400 },
  { name: 'DeskFlow', tagline: 'Customer support inbox reimagined', category: 'saas', logo: '📬', website: 'https://deskflow.io', raised: 1999 },
  { name: 'CRMly', tagline: 'CRM that founders actually use', category: 'saas', logo: '📊', website: 'https://crmly.app', raised: 1200 },
  { name: 'SchedulePop', tagline: 'Calendar for busy teams', category: 'saas', logo: '📅', website: 'https://schedulepop.com', raised: 750 },
  { name: 'FormWave', tagline: 'Beautiful forms, zero code', category: 'saas', logo: '📝', website: 'https://formwave.io', raised: 350 },
  { name: 'MailPunch', tagline: 'Cold email that lands in inbox', category: 'saas', logo: '📧', website: 'https://mailpunch.co', raised: 120 },

  { name: 'DeployKit', tagline: 'One-click deploys for indie devs', category: 'dev-tools', logo: '🚀', website: 'https://deploykit.dev', raised: 2300 },
  { name: 'LogLens', tagline: "Structured logs that don't suck", category: 'dev-tools', logo: '🔎', website: 'https://loglens.dev', raised: 1400 },
  { name: 'DBSnap', tagline: 'Postgres branching in a click', category: 'dev-tools', logo: '💾', website: 'https://dbsnap.io', raised: 600 },
  { name: 'AuthBox', tagline: 'Drop-in auth for any framework', category: 'dev-tools', logo: '🔐', website: 'https://authbox.dev', raised: 450 },
  { name: 'CronCloud', tagline: 'Scheduled jobs without servers', category: 'dev-tools', logo: '⏰', website: 'https://croncloud.io', raised: 60 },

  { name: 'GreenLeaf', tagline: 'Carbon-neutral SaaS billing', category: 'startups', logo: '🌱', website: 'https://greenleaf.eco', raised: 3100 },
  { name: 'RocketDocs', tagline: 'Docs for shipping teams', category: 'startups', logo: '📚', website: 'https://rocketdocs.io', raised: 1700 },
  { name: 'FundedFast', tagline: 'Match founders with angels', category: 'startups', logo: '💰', website: 'https://fundedfast.com', raised: 900 },
  { name: 'TeamPulse', tagline: 'Remote culture, quantified', category: 'startups', logo: '💓', website: 'https://teampulse.hr', raised: 300 },

  { name: '@aria.builds',   tagline: 'Building in public • 42k on X', category: 'creators', logo: '🌟', website: 'https://x.com/ariabuilds', raised: 1850, type: 'PROFILE' },
  { name: '@makerkev',      tagline: 'Indie hacker • SaaS memes', category: 'creators', logo: '😎', website: 'https://x.com/makerkev', raised: 900, type: 'PROFILE' },
  { name: '@design.daily',  tagline: 'UI teardowns every morning', category: 'creators', logo: '🎨', website: 'https://instagram.com/designdaily', raised: 640, type: 'PROFILE' },
  { name: '@zoe.codes',     tagline: 'React tips • shipping fast', category: 'creators', logo: '👩‍💻', website: 'https://x.com/zoecodes', raised: 250, type: 'PROFILE' },

  { name: '@raj.dev',       tagline: 'Rust + distributed systems', category: 'developers', logo: '🦀', website: 'https://github.com/rajdev', raised: 1250, type: 'PROFILE' },
  { name: '@lena.ships',    tagline: 'Full-stack • Next.js expert', category: 'developers', logo: '⛵', website: 'https://github.com/lenaships', raised: 400, type: 'PROFILE' },
  { name: '@marco.designs', tagline: 'Product designer • ex-Airbnb', category: 'designers', logo: '✨', website: 'https://dribbble.com/marco', raised: 700, type: 'PROFILE' },
];

const BACKER_NAMES = ['Aarav', 'Priya', 'Rohit', 'Sneha', 'Kabir', 'Meera', 'Dev', 'Ishita', 'Arjun', 'Nisha', 'Vikram', 'Tara', 'Anonymous Angel', 'Zoya', 'Sam'];

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}
function creatorShare(raised) { return Math.round((raised || 0) * CREATOR_SHARE); }
function charityShare(raised) { return Math.round((raised || 0) * CHARITY_SHARE); }
function platformShare(raised) { return (raised || 0) - creatorShare(raised) - charityShare(raised); }
const SPLIT = {
  creatorPct: CREATOR_SHARE * 100,
  charityPct: CHARITY_SHARE * 100,
  platformPct: PLATFORM_SHARE * 100,
};

/* ------------------------- enrichment ------------------------- */
async function enrichListings(db, listings) {
  const now = new Date();
  const ids = listings.map(l => l.id);
  const activePromos = await db.collection('promotions')
    .find({ listingId: { $in: ids }, endAt: { $gt: now } }).toArray();
  const boostMap = {};
  const expiryMap = {};
  for (const p of activePromos) {
    boostMap[p.listingId] = (boostMap[p.listingId] || 0) + p.amount;
    if (!expiryMap[p.listingId] || p.endAt > expiryMap[p.listingId]) expiryMap[p.listingId] = p.endAt;
  }
  const payouts = await db.collection('payouts').aggregate([
    { $match: { listingId: { $in: ids } } },
    { $group: { _id: '$listingId', paid: { $sum: '$amount' } } },
  ]).toArray();
  const paidMap = Object.fromEntries(payouts.map(p => [p._id, p.paid]));

  return listings.map(l => {
    const boost = boostMap[l.id] || 0;
    const raised = l.totalRaised || 0;
    return {
      ...l,
      raised,
      selfPaid: l.selfPaid || 0,
      donated: l.donated || 0,
      backers: l.backers || 0,
      boost,
      score: raised + boost,
      creatorShare: creatorShare(raised),
      paidOut: paidMap[l.id] || 0,
      sponsored: boost > 0,
      promotionExpiry: expiryMap[l.id] || null,
    };
  });
}


/* ------------------------- crediting a payment (shared by MOCK + Stripe) ------------------------- */
async function applyContribution(db, opts) {
  const { listing, amount, kind, user, backerName, message, anonymous, plan, provider, providerRef, paymentId } = opts;
  const now = new Date();

  const contribution = {
    id: uuidv4(),
    listingId: listing.id,
    listingName: listing.name,
    userId: user?.id || null,
    kind,
    backerName: kind === 'SELF_PAY'
      ? 'Owner (self-paid)'
      : (anonymous ? 'Anonymous' : (backerName || user?.name || 'Anonymous')),
    amount,
    message: String(message || '').slice(0, 200),
    provider: provider || 'MOCK',
    providerRef: providerRef || null,
    status: 'SUCCESS',
    paymentId: paymentId || null,
    createdAt: now,
  };
  await db.collection('contributions').insertOne(contribution);

  const inc = { totalRaised: amount, backers: 1 };
  if (kind === 'SELF_PAY') inc.selfPaid = amount; else inc.donated = amount;
  await db.collection('listings').updateOne({ id: listing.id }, { $inc: inc });

  await db.collection('rank_events').insertOne({
    id: uuidv4(), listingId: listing.id, listingName: listing.name,
    eventType: kind, amount, backerName: contribution.backerName, recordedAt: now,
  });

  if (plan && PLANS[plan]) {
    const pl = PLANS[plan];
    await db.collection('promotions').insertOne({
      id: uuidv4(), listingId: listing.id, paymentId: paymentId || null, plan: pl.id, amount,
      startAt: now, endAt: new Date(now.getTime() + pl.duration), active: true, createdAt: now,
    });
  }

  const sameCat = await db.collection('listings')
    .find({ category: listing.category, status: { $ne: 'REJECTED' } }).toArray();
  const enriched = await enrichListings(db, sameCat);
  enriched.sort((a, b) => b.score - a.score);
  const newRank = enriched.findIndex(l => l.id === listing.id) + 1;
  const updated = enriched.find(l => l.id === listing.id);

  return {
    contribution,
    newRank,
    totalRaised: updated?.raised || amount,
    selfPaid: updated?.selfPaid || 0,
    donated: updated?.donated || 0,
    creatorShare: updated?.creatorShare || creatorShare(amount),
  };
}

/* ------------------------- seeding ------------------------- */
const SEED_VERSION = 5;
const ADMIN_EMAIL = 'admin@donatecolab.com';
const ADMIN_PASSWORD = 'Admin@123';

async function ensureAdmin(db) {
  const existing = await db.collection('users').findOne({ email: ADMIN_EMAIL });
  if (existing) return;
  await db.collection('users').insertOne({
    id: uuidv4(),
    name: 'Platform Admin',
    email: ADMIN_EMAIL,
    passwordHash: hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    createdAt: new Date(),
  });
}

function splitAmount(total) {
  // split total into 2-6 plausible contributions (min ₹1 each)
  const n = Math.min(6, Math.max(2, Math.round(total / 400) + 2));
  const parts = [];
  let left = total;
  for (let i = 0; i < n - 1; i++) {
    const max = Math.max(1, Math.floor(left / (n - i)) * 2);
    const v = Math.max(1, Math.floor(Math.random() * max) || 1);
    if (left - v < n - i - 1) break;
    parts.push(v);
    left -= v;
  }
  if (left > 0) parts.push(left);
  return parts.filter(p => p > 0);
}

let seedPromise = null;
async function seedIfNeeded(db) {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    await ensureAdmin(db);
    const meta = await db.collection('meta').findOne({ _id: 'seed' });
    if (meta?.version === SEED_VERSION) return { seeded: false };
    try {
      await db.collection('meta').insertOne({ _id: 'seed-lock-v' + SEED_VERSION, at: new Date() });
    } catch (e) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 300));
        const m = await db.collection('meta').findOne({ _id: 'seed' });
        if (m?.version === SEED_VERSION) return { seeded: false, waited: true };
      }
      return { seeded: false, timeout: true };
    }
    for (const c of ['listings', 'promotions', 'contributions', 'rank_events', 'payments', 'payouts']) {
      await db.collection(c).deleteMany({});
    }
    const now = new Date();
    const listings = [];
    const contributions = [];
    const promotions = [];
    const events = [];
    for (const s of SEED_LISTINGS) {
      const id = uuidv4();
      const selfPaid = Math.round(s.raised * 0.4);
      const donatedTotal = s.raised - selfPaid;
      const parts = splitAmount(donatedTotal);
      listings.push({
        id,
        type: s.type || 'PRODUCT',
        name: s.name,
        slug: slugify(s.name),
        tagline: s.tagline,
        description: s.tagline,
        logo: s.logo,
        website: s.website,
        contactEmail: s.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 14) + '@example.com',
        category: s.category,
        socials: {},
        status: 'APPROVED',
        verified: Math.random() > 0.6,
        foundingBadge: true,
        ownerId: null,
        totalRaised: s.raised,
        selfPaid,
        donated: donatedTotal,
        backers: parts.length + (selfPaid > 0 ? 1 : 0),
        connects: Math.floor(Math.random() * 40),
        createdAt: new Date(now.getTime() - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)),
      });
      if (selfPaid > 0) {
        const at = new Date(now.getTime() - Math.floor(Math.random() * 12 * 24 * 3600 * 1000));
        contributions.push({
          id: uuidv4(), listingId: id, listingName: s.name, userId: null,
          backerName: 'Owner (self-paid)', kind: 'SELF_PAY',
          amount: selfPaid, message: '', provider: 'MOCK', status: 'SUCCESS', createdAt: at,
        });
        events.push({
          id: uuidv4(), listingId: id, listingName: s.name, eventType: 'SELF_PAY',
          backerName: s.name, amount: selfPaid, recordedAt: at,
        });
      }
      parts.forEach((amt, idx) => {
        const at = new Date(now.getTime() - Math.floor(Math.random() * 10 * 24 * 3600 * 1000));
        contributions.push({
          id: uuidv4(), listingId: id, listingName: s.name, userId: null,
          backerName: BACKER_NAMES[Math.floor(Math.random() * BACKER_NAMES.length)],
          kind: 'DONATION',
          amount: amt, message: '', provider: 'MOCK', status: 'SUCCESS', createdAt: at,
        });
        events.push({
          id: uuidv4(), listingId: id, listingName: s.name, eventType: 'DONATION',
          amount: amt, recordedAt: at,
        });
      });
      if (s.raised > 1000) {
        promotions.push({
          id: uuidv4(), listingId: id, plan: 'weekly', amount: Math.round(s.raised * 0.15),
          startAt: now, endAt: new Date(now.getTime() + (2 + Math.floor(Math.random() * 6)) * 24 * 3600 * 1000),
          active: true, createdAt: now,
        });
      }
    }
    if (listings.length) await db.collection('listings').insertMany(listings);
    if (contributions.length) await db.collection('contributions').insertMany(contributions);
    if (promotions.length) await db.collection('promotions').insertMany(promotions);
    if (events.length) await db.collection('rank_events').insertMany(events);
    await db.collection('meta').updateOne({ _id: 'seed' }, { $set: { version: SEED_VERSION, at: new Date() } }, { upsert: true });
    return { seeded: true, count: listings.length };
  })();
  return seedPromise;
}

function json(data, status = 200) { return NextResponse.json(data, { status }); }

/* ------------------------- Stripe fulfilment (idempotent) ------------------------- */
async function fulfilStripeSession(db, sessionId) {
  const record = await db.collection('payments').findOne({ sessionId });
  if (!record) return { status: 404, body: { error: 'Unknown payment session' } };

  // already credited -> return the stored outcome
  if (record.creditedAt) {
    return {
      status: 200,
      body: {
        status: 'paid', credited: false, duplicate: true,
        newRank: record.newRank || null, amount: record.amount,
        listingId: record.listingId, listingName: record.listingName, kind: record.kind,
      },
    };
  }

  let session;
  try {
    session = await retrieveCheckoutSession(sessionId);
  } catch (e) {
    return { status: 502, body: { error: 'Could not verify payment with Stripe' } };
  }

  if (session.payment_status !== 'paid') {
    return { status: 200, body: { status: session.payment_status || 'unpaid', credited: false } };
  }
  // amounts must match what we created
  if (typeof session.amount_total === 'number' && record.amountMinor && session.amount_total !== record.amountMinor) {
    return { status: 409, body: { error: 'Amount mismatch' } };
  }

  // atomic claim so a webhook + polling race credits only once
  const claim = await db.collection('payments').findOneAndUpdate(
    { sessionId, creditedAt: null },
    { $set: { creditedAt: new Date(), status: 'SUCCESS', stripePaymentIntent: session.payment_intent || null } },
    { returnDocument: 'after' }
  );
  const claimed = claim?.value || claim;
  if (!claimed || !claimed.creditedAt) {
    return { status: 200, body: { status: 'paid', credited: false, duplicate: true } };
  }

  const listing = await db.collection('listings').findOne({ id: record.listingId });
  if (!listing) return { status: 404, body: { error: 'listing not found' } };
  const user = record.userId ? await db.collection('users').findOne({ id: record.userId }) : null;

  const res = await applyContribution(db, {
    listing,
    amount: record.amount,
    kind: record.kind,
    user,
    backerName: record.backerName,
    message: record.message,
    anonymous: record.anonymous,
    plan: record.plan,
    provider: 'STRIPE',
    providerRef: session.payment_intent || sessionId,
    paymentId: record.id,
  });

  await db.collection('payments').updateOne({ sessionId }, { $set: { newRank: res.newRank } });

  return {
    status: 200,
    body: {
      status: 'paid', credited: true, mode: 'STRIPE',
      listingId: listing.id, listingName: listing.name, listingLogo: listing.logo,
      listingImage: listing.image || '', category: listing.category,
      kind: record.kind, amount: record.amount, ...res,
    },
  };
}



async function totals(db) {
  const agg = await db.collection('contributions').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' }, backers: { $sum: 1 } } },
  ]).toArray();
  const byKind = await db.collection('contributions').aggregate([
    { $group: { _id: '$kind', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]).toArray();
  const kindMap = Object.fromEntries(byKind.map(k => [k._id || 'DONATION', k]));
  const boostAgg = await db.collection('promotions').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).toArray();
  const paidAgg = await db.collection('payouts').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).toArray();
  const totalRaised = agg[0]?.total || 0;
  return {
    totalRaised,
    totalBackers: agg[0]?.backers || 0,
    selfPaidTotal: kindMap.SELF_PAY?.total || 0,
    donatedTotal: kindMap.DONATION?.total || 0,
    donationCount: kindMap.DONATION?.count || 0,
    totalBoosts: boostAgg[0]?.total || 0,
    creatorPool: creatorShare(totalRaised),
    charityPool: charityShare(totalRaised),
    platformPool: platformShare(totalRaised),
    split: SPLIT,
    paidOut: paidAgg[0]?.total || 0,
  };
}

/* ------------------------- handler ------------------------- */
async function handler(request, context) {
  const params = await context.params;
  const pathArr = params?.path || [];
  const path = '/' + pathArr.join('/');
  const method = request.method;
  const url = new URL(request.url);
  const db = await getDb();

  try {
    await seedIfNeeded(db);

    if (path === '/health' && method === 'GET') return json({ ok: true, ts: Date.now() });

    /* ---------- auth ---------- */
    if (path === '/auth/register' && method === 'POST') {
      const { name, email, password } = await request.json();
      if (!name || !email || !password) return json({ error: 'name, email and password are required' }, 400);
      if (String(password).length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      const em = String(email).trim().toLowerCase();
      const exists = await db.collection('users').findOne({ email: em });
      if (exists) return json({ error: 'An account with this email already exists. Please log in.' }, 409);
      const user = {
        id: uuidv4(), name: String(name).trim(), email: em,
        passwordHash: hashPassword(password), role: 'user', createdAt: new Date(),
      };
      await db.collection('users').insertOne(user);
      const token = await createSession(db, user.id);
      return json({ token, user: publicUser(user) });
    }

    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      const em = String(email || '').trim().toLowerCase();
      const user = await db.collection('users').findOne({ email: em });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return json({ error: 'Invalid email or password' }, 401);
      }
      const token = await createSession(db, user.id);
      return json({ token, user: publicUser(user) });
    }

    // Google login via Emergent managed auth (no OAuth keys required)
    if (path === '/auth/google/session' && method === 'POST') {
      const { sessionId } = await request.json();
      if (!sessionId) return json({ error: 'sessionId required' }, 400);
      const r = await fetch('https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data', {
        method: 'GET',
        headers: { 'X-Session-ID': sessionId },
        cache: 'no-store',
      });
      if (!r.ok) return json({ error: 'Google session is invalid or expired. Please try again.' }, 401);
      const profile = await r.json();
      const email = String(profile?.email || '').trim().toLowerCase();
      if (!email) return json({ error: 'Google did not return an email' }, 401);
      const name = profile?.name || email.split('@')[0];
      let user = await db.collection('users').findOne({ email });
      if (!user) {
        user = {
          id: uuidv4(), name, email, passwordHash: null, role: 'user',
          provider: 'google', picture: profile?.picture || '', createdAt: new Date(),
        };
        await db.collection('users').insertOne(user);
      } else {
        await db.collection('users').updateOne({ id: user.id }, { $set: { provider: user.provider || 'google', picture: profile?.picture || user.picture || '' } });
      }
      const token = await createSession(db, user.id);
      return json({ token, user: publicUser(user) });
    }

    if (path === '/auth/me' && method === 'GET') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      return json({ user: publicUser(user) });
    }

    if (path === '/auth/logout' && method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) await db.collection('sessions').deleteOne({ token });
      return json({ ok: true });
    }

    /* ---------- public data ---------- */
    if (path === '/categories' && method === 'GET') {
      const counts = await db.collection('listings').aggregate([
        { $match: { status: { $ne: 'REJECTED' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).toArray();
      const map = Object.fromEntries(counts.map(c => [c._id, c.count]));
      return json({ categories: CATEGORIES.map(c => ({ ...c, count: map[c.id] || 0 })) });
    }

    // GET /api/currencies -> supported currencies + region guess from edge headers
    if (path === '/currencies' && method === 'GET') {
      const h = request.headers;
      const country = (h.get('cf-ipcountry') || h.get('x-vercel-ip-country') || h.get('x-country-code') || h.get('x-geo-country') || '').toUpperCase();
      const detected = COUNTRY_CURRENCY[country] || null;
      return json({
        base: BASE_CURRENCY,
        country: country || null,
        detected,
        currencies: Object.values(CURRENCIES).map(c => ({
          code: c.code, symbol: c.symbol, name: c.name, rateToInr: c.rateToInr,
          cardMin: c.cardMin, chips: c.chips, zeroDecimal: !!c.zeroDecimal,
        })),
      });
    }

    if (path === '/plans' && method === 'GET') {
      return json({ plans: Object.values(PLANS), split: SPLIT, creatorSharePct: CREATOR_SHARE * 100 });
    }

    if (path === '/stats' && method === 'GET') {
      const t = await totals(db);
      const now = new Date();
      const totalListings = await db.collection('listings').countDocuments({ status: { $ne: 'REJECTED' } });
      const activePromos = await db.collection('promotions').countDocuments({ endAt: { $gt: now } });
      return json({
        ...t,
        totalListings,
        activePromos,
        creatorSharePct: CREATOR_SHARE * 100,
        charitySharePct: CHARITY_SHARE * 100,
        platformSharePct: PLATFORM_SHARE * 100,
        viewersOnline: 30 + Math.floor(Math.random() * 80),
      });
    }

    if (path === '/rankings' && method === 'GET') {
      const category = url.searchParams.get('category');
      const type = url.searchParams.get('type');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const q = { status: { $ne: 'REJECTED' } };
      if (category && category !== 'all') q.category = category;
      if (type && type !== 'all') q.type = type;
      const listings = await db.collection('listings').find(q, { projection: { _id: 0 } }).toArray();
      const enriched = await enrichListings(db, listings);
      enriched.sort((a, b) => (b.score - a.score) || (new Date(b.createdAt) - new Date(a.createdAt)));
      return json({ rankings: enriched.slice(0, limit).map((l, i) => ({ ...l, rank: i + 1 })) });
    }

    if (path === '/trending/instagram' && method === 'GET') {
      const listings = await db.collection('listings')
        .find({ category: 'instagram', status: { $ne: 'REJECTED' } }, { projection: { _id: 0 } }).toArray();
      const enriched = await enrichListings(db, listings);
      enriched.sort((a, b) => b.score - a.score);
      return json({ trending: enriched.slice(0, 6).map((l, i) => ({ ...l, rank: i + 1 })) });
    }

    // Public transparency: where the money goes
    if (path === '/impact' && method === 'GET') {
      const t = await totals(db);
      const disbursed = await db.collection('charity').aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray();
      const recent = await db.collection('charity')
        .find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(10).toArray();
      const given = disbursed[0]?.total || 0;
      return json({
        totalRaised: t.totalRaised,
        creatorPool: t.creatorPool,
        charityPool: t.charityPool,
        platformPool: t.platformPool,
        charityGiven: given,
        charityRemaining: Math.max(0, t.charityPool - given),
        recent,
        split: SPLIT,
      });
    }

    if (path === '/activity' && method === 'GET') {
      const events = await db.collection('rank_events')
        .find({}, { projection: { _id: 0 } }).sort({ recordedAt: -1 }).limit(20).toArray();
      return json({ activity: events });
    }

    if (path.startsWith('/listings/') && pathArr.length === 3 && pathArr[2] === 'backers' && method === 'GET') {
      const listingId = pathArr[1];
      const backers = await db.collection('contributions')
        .find({ listingId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
      return json({ backers });
    }

    if (path.startsWith('/listings/') && pathArr.length === 2 && method === 'GET') {
      const listing = await db.collection('listings').findOne({ slug: pathArr[1] }, { projection: { _id: 0 } });
      if (!listing) return json({ error: 'Not found' }, 404);
      const [enriched] = await enrichListings(db, [listing]);
      return json({ listing: enriched });
    }

    /* ---------- profile picture import (keyless, marked UNVERIFIED) ---------- */
    if (path === '/import/profile' && method === 'POST') {
      const body = await request.json();
      const network = String(body.network || 'instagram').toLowerCase();
      let handle = String(body.handle || '').trim();
      // accept full URLs too
      handle = handle.replace(/^https?:\/\/(www\.)?(instagram|twitter|x|github|linkedin)\.com\/(in\/)?/i, '');
      handle = handle.replace(/^@/, '').replace(/\/.*$/, '').toLowerCase();
      if (!/^[a-z0-9._-]{1,40}$/.test(handle)) {
        return json({ error: 'Enter a valid handle, e.g. @yourname' }, 400);
      }
      const UNAVATAR_TOKEN = process.env.UNAVATAR_TOKEN || '';
      const supported = { instagram: 'instagram', x: 'x', twitter: 'x', github: 'github', youtube: 'youtube' };
      if (network === 'linkedin') {
        return json({
          error: 'LinkedIn blocks profile lookups by URL. Ask the owner to Sign in with LinkedIn (needs LinkedIn app keys) — or upload / paste a picture instead.',
          needsKeys: true, provider: 'linkedin',
        }, 422);
      }
      const provider = supported[network];
      if (!provider) return json({ error: 'Unsupported network' }, 400);
      if (provider === 'instagram' && !UNAVATAR_TOKEN) {
        return json({
          error: 'Instagram picture import needs credentials (Meta Instagram Graph app, or an avatar-proxy pro key). Upload or paste a picture for now.',
          needsKeys: true, provider: 'instagram',
        }, 422);
      }

      let imageUrl = `https://unavatar.io/${provider}/${encodeURIComponent(handle)}?fallback=false`;
      if (UNAVATAR_TOKEN) imageUrl += `&token=${encodeURIComponent(UNAVATAR_TOKEN)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const probe = await fetch(imageUrl, { signal: controller.signal, redirect: 'follow', cache: 'no-store' });
        clearTimeout(timer);
        const ct = probe.headers.get('content-type') || '';
        if (!probe.ok || !ct.startsWith('image/')) {
          return json({ error: `No public picture found for @${handle} on ${network}. Upload or paste an image instead.` }, 422);
        }
        return json({
          ok: true, network, handle, imageUrl: imageUrl.split('&token=')[0],
          verified: false,
          source: 'public-avatar-proxy',
          note: 'Unverified public picture. Connect the official API for a verified badge.',
        });
      } catch (e) {
        clearTimeout(timer);
        return json({ error: 'Could not fetch that picture right now. Upload or paste an image instead.' }, 502);
      }
    }

    if (path === '/listings' && method === 'POST') {
      const body = await request.json();
      const user = await currentUser(db, request);
      const { type = 'PRODUCT', name, tagline, description, logo, website, category, socials, contactEmail, image, network, handle } = body;
      if (!name || !category) return json({ error: 'name and category required' }, 400);
      const listing = {
        id: uuidv4(), type, name, slug: slugify(name),
        tagline: tagline || '', description: description || tagline || '',
        logo: logo || '🚀', website: website || '',
        image: image || '',
        network: network || '',
        handle: handle || '',
        imageVerified: false,
        contactEmail: contactEmail || user?.email || '',
        category, socials: socials || {},
        status: 'APPROVED', verified: false, foundingBadge: false,
        ownerId: user?.id || null,
        totalRaised: 0, backers: 0, connects: 0,
        createdAt: new Date(),
      };
      await db.collection('listings').insertOne(listing);
      return json({ listing: { ...listing, raised: 0, score: 0, creatorShare: 0 } });
    }

    /* ---------- invest: SELF_PAY (owner pays to rank) or DONATION (fans push you up) ---------- */
    // Kept for MOCK mode / backward compatibility. Real money goes through /payments/checkout.
    if (path === '/support' && method === 'POST') {
      const body = await request.json();
      const user = await currentUser(db, request);
      const listingId = body.listingId;
      const localAmount = Math.floor(Number(body.amount));
      const cur = currencyOf(body.currency || BASE_CURRENCY);
      const kind = body.kind === 'SELF_PAY' ? 'SELF_PAY' : 'DONATION';
      if (!listingId) return json({ error: 'listingId required' }, 400);
      if (!Number.isFinite(localAmount) || localAmount < 1) {
        return json({ error: `Minimum amount is ${cur.symbol}1` }, 400);
      }
      const amount = cur.code === BASE_CURRENCY ? localAmount : toBase(localAmount, cur.code);
      const listing = await db.collection('listings').findOne({ id: listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);

      const payment = {
        id: uuidv4(), listingId, userId: user?.id || null, provider: 'MOCK',
        amount, currency: BASE_CURRENCY,
        localAmount, localCurrency: cur.code,
        status: 'SUCCESS', kind, createdAt: new Date(),
      };
      await db.collection('payments').insertOne(payment);

      const res = await applyContribution(db, {
        listing, amount, kind, user,
        backerName: body.backerName, message: body.message, anonymous: body.anonymous,
        plan: body.plan, provider: 'MOCK', paymentId: payment.id,
      });

      return json({
        ok: true, mode: 'MOCK', ...res, category: listing.category, kind, payment,
        localAmount, localCurrency: cur.code, baseAmount: amount,
        split: {
          ...SPLIT,
          creatorAmount: creatorShare(amount),
          charityAmount: charityShare(amount),
          platformAmount: platformShare(amount),
        },
        creatorSharePct: CREATOR_SHARE * 100,
      });
    }

    /* ---------- REAL payments: Stripe Checkout (Emergent managed sandbox) ---------- */
    if (path === '/payments/config' && method === 'GET') {
      return json({
        provider: stripeEnabled ? 'stripe' : 'mock', mode: stripeMode,
        cardMinAmount: STRIPE_MIN_INR, base: BASE_CURRENCY, live: false, sandbox: true,
      });
    }

    if (path === '/payments/checkout' && method === 'POST') {
      const body = await request.json();
      const user = await currentUser(db, request);
      const localAmount = Math.floor(Number(body.amount));
      const cur = currencyOf(body.currency || BASE_CURRENCY);
      const kind = body.kind === 'SELF_PAY' ? 'SELF_PAY' : 'DONATION';
      if (!body.listingId) return json({ error: 'listingId required' }, 400);
      if (!Number.isFinite(localAmount) || localAmount < 1) {
        return json({ error: `Minimum amount is ${cur.symbol}1` }, 400);
      }
      const amount = cur.code === BASE_CURRENCY ? localAmount : toBase(localAmount, cur.code);
      const listing = await db.collection('listings').findOne({ id: body.listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      if (!stripeEnabled) return json({ error: 'STRIPE_UNAVAILABLE', mode: 'MOCK' }, 503);
      if (localAmount < cur.cardMin) {
        return json({
          error: `Card payments start at ${cur.symbol}${cur.cardMin} (Stripe's minimum). Smaller amounts are recorded in demo mode.`,
          code: 'BELOW_CARD_MIN', minAmount: cur.cardMin, currency: cur.code, mode: 'MOCK',
        }, 409);
      }

      const origin = process.env.NEXT_PUBLIC_BASE_URL || url.origin;
      const paymentId = uuidv4();
      try {
        const { session, currency, unit } = await createCheckoutSession({
          amount: localAmount,
          currency: cur.code.toLowerCase(),
          minorUnits: toMinorUnits(localAmount, cur.code),
          name: kind === 'SELF_PAY' ? `Pay to rank — ${listing.name}` : `Donation to ${listing.name}`,
          description: kind === 'SELF_PAY'
            ? 'Climb the Donate & Colab leaderboard'
            : 'Push this listing up the Donate & Colab leaderboard',
          metadata: {
            paymentId, listingId: listing.id, kind, amount: String(amount),
            userId: user?.id || '', plan: body.plan || '',
          },
          successUrl: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/pay/cancel`,
        });

        await db.collection('payments').insertOne({
          id: paymentId,
          listingId: listing.id,
          listingName: listing.name,
          userId: user?.id || null,
          provider: 'STRIPE',
          sessionId: session.id,
          amount,
          localAmount,
          localCurrency: cur.code,
          amountMinor: unit,
          currency: currency.toUpperCase(),
          kind,
          plan: body.plan || '',
          message: String(body.message || '').slice(0, 200),
          anonymous: !!body.anonymous,
          backerName: body.backerName || user?.name || '',
          status: 'PENDING',
          creditedAt: null,
          createdAt: new Date(),
        });

        return json({ ok: true, mode: 'STRIPE', sessionId: session.id, url: session.url, currency });
      } catch (e) {
        console.error('Stripe checkout error:', e.message);
        return json({ error: 'Could not start Stripe checkout: ' + e.message }, 502);
      }
    }

    // Fulfil a paid session exactly once (used by success page polling + webhook)
    if (path === '/payments/status' && method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return json({ error: 'session_id required' }, 400);
      if (!stripeEnabled) return json({ error: 'STRIPE_UNAVAILABLE' }, 503);
      const result = await fulfilStripeSession(db, sessionId);
      return json(result.body, result.status);
    }

    if (path === '/webhook/stripe' && method === 'POST') {
      if (!stripeEnabled) return json({ ignored: true });
      const raw = await request.text();
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      let event;
      if (secret) {
        try {
          event = verifyWebhook(raw, request.headers.get('stripe-signature'), secret);
        } catch (e) {
          return json({ error: 'invalid signature' }, 400);
        }
      } else {
        // No signing secret configured (sandbox): accept but only trust the session id,
        // every value is re-read from Stripe before crediting.
        try { event = JSON.parse(raw); } catch (e) { return json({ error: 'bad payload' }, 400); }
      }
      const type = event?.type;
      const sessionId = event?.data?.object?.id;
      if (sessionId && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(type)) {
        await fulfilStripeSession(db, sessionId);
      }
      return json({ received: true });
    }

    /* ---------- what does it cost to grab #1 / the next rank ---------- */
    if (path === '/rank-target' && method === 'GET') {
      const listingId = url.searchParams.get('listingId');
      if (!listingId) return json({ error: 'listingId required' }, 400);
      const listing = await db.collection('listings').findOne({ id: listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      const sameCat = await db.collection('listings')
        .find({ category: listing.category, status: { $ne: 'REJECTED' } }).toArray();
      const enriched = await enrichListings(db, sameCat);
      enriched.sort((a, b) => b.score - a.score);
      const idx = enriched.findIndex(l => l.id === listingId);
      const me = enriched[idx];
      const top = enriched[0];
      const above = idx > 0 ? enriched[idx - 1] : null;
      const toBeatTop = idx === 0 ? 0 : Math.max(1, top.score - me.score + 1);
      const toBeatAbove = above ? Math.max(1, above.score - me.score + 1) : 0;
      return json({
        listingId, category: listing.category,
        currentRank: idx + 1,
        myScore: me.score,
        topName: top?.name || '',
        topScore: top?.score || 0,
        aboveName: above?.name || '',
        toBeatTop,
        toBeatAbove,
        isTop: idx === 0,
      });
    }

    // legacy boost endpoint kept working
    if (path === '/promotions' && method === 'POST') {
      const body = await request.json();
      const p = PLANS[body.plan] || PLANS.spark;
      const amount = Math.max(1, Math.floor(Number(body.customAmount || p.price)));
      const listing = await db.collection('listings').findOne({ id: body.listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      const now = new Date();
      const payment = { id: uuidv4(), listingId: listing.id, provider: 'MOCK', amount, currency: 'INR', status: 'SUCCESS', kind: 'BOOST', createdAt: now };
      await db.collection('payments').insertOne(payment);
      await db.collection('promotions').insertOne({
        id: uuidv4(), listingId: listing.id, paymentId: payment.id, plan: p.id, amount,
        startAt: now, endAt: new Date(now.getTime() + p.duration), active: true, createdAt: now,
      });
      await db.collection('contributions').insertOne({
        id: uuidv4(), listingId: listing.id, listingName: listing.name, userId: null,
        backerName: 'Boost', amount, message: '', provider: 'MOCK', status: 'SUCCESS', createdAt: now,
      });
      await db.collection('listings').updateOne({ id: listing.id }, { $inc: { totalRaised: amount, backers: 1 } });
      await db.collection('rank_events').insertOne({
        id: uuidv4(), listingId: listing.id, listingName: listing.name, eventType: 'BOOST', amount, recordedAt: now,
      });
      const sameCat = await db.collection('listings').find({ category: listing.category }).toArray();
      const enriched = await enrichListings(db, sameCat);
      enriched.sort((a, b) => b.score - a.score);
      const newRank = enriched.findIndex(l => l.id === listing.id) + 1;
      return json({ ok: true, payment, newRank, category: listing.category });
    }

    /* ---------- connect (requires login) ---------- */
    if (path === '/connect' && method === 'POST') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'LOGIN_REQUIRED' }, 401);
      const { listingId, message } = await request.json();
      const listing = await db.collection('listings').findOne({ id: listingId }, { projection: { _id: 0 } });
      if (!listing) return json({ error: 'listing not found' }, 404);
      await db.collection('connect_requests').insertOne({
        id: uuidv4(), listingId, listingName: listing.name, userId: user.id,
        userName: user.name, userEmail: user.email, message: (message || '').slice(0, 300),
        status: 'OPEN', createdAt: new Date(),
      });
      await db.collection('listings').updateOne({ id: listingId }, { $inc: { connects: 1 } });
      return json({
        ok: true,
        contact: {
          name: listing.name,
          website: listing.website || '',
          email: listing.contactEmail || '',
          socials: listing.socials || {},
        },
      });
    }

    /* ---------- user dashboard ---------- */
    if (path === '/me/listings' && method === 'GET') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const listings = await db.collection('listings').find({ ownerId: user.id }, { projection: { _id: 0 } }).toArray();
      const enriched = await enrichListings(db, listings);
      return json({ listings: enriched, creatorSharePct: CREATOR_SHARE * 100 });
    }

    if (path === '/me/investments' && method === 'GET') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const items = await db.collection('contributions')
        .find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      const invested = items.reduce((s, i) => s + i.amount, 0);
      return json({ investments: items, invested });
    }

    /* ---------- admin ---------- */
    if (path.startsWith('/admin')) {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.role !== 'admin') return json({ error: 'Admin access only' }, 403);

      if (path === '/admin/overview' && method === 'GET') {
        const t = await totals(db);
        const now = new Date();
        const [totalListings, pending, rejected, users, connects, activePromos] = await Promise.all([
          db.collection('listings').countDocuments({}),
          db.collection('listings').countDocuments({ status: 'PENDING' }),
          db.collection('listings').countDocuments({ status: 'REJECTED' }),
          db.collection('users').countDocuments({}),
          db.collection('connect_requests').countDocuments({}),
          db.collection('promotions').countDocuments({ endAt: { $gt: now } }),
        ]);
        const charityAgg = await db.collection('charity').aggregate([
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).toArray();
        const charityGiven = charityAgg[0]?.total || 0;
        const recent = await db.collection('contributions')
          .find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(15).toArray();
        const topRaw = await db.collection('listings').find({}, { projection: { _id: 0 } })
          .sort({ totalRaised: -1 }).limit(8).toArray();
        const top = await enrichListings(db, topRaw);
        return json({
          ...t, totalListings, pending, rejected, users, connects, activePromos,
          charityGiven, charityRemaining: Math.max(0, t.charityPool - charityGiven),
          creatorSharePct: CREATOR_SHARE * 100, recent, top,
        });
      }

      if (path === '/admin/listings' && method === 'GET') {
        const status = url.searchParams.get('status');
        const q = status && status !== 'all' ? { status } : {};
        const raw = await db.collection('listings').find(q, { projection: { _id: 0 } })
          .sort({ totalRaised: -1 }).limit(200).toArray();
        return json({ listings: await enrichListings(db, raw) });
      }

      if (path.startsWith('/admin/listings/') && (method === 'PATCH' || method === 'PUT')) {
        const id = pathArr[2];
        const body = await request.json();
        const set = {};
        if (body.status) set.status = body.status;
        if (typeof body.verified === 'boolean') set.verified = body.verified;
        if (typeof body.featured === 'boolean') set.featured = body.featured;
        if (!Object.keys(set).length) return json({ error: 'nothing to update' }, 400);
        await db.collection('listings').updateOne({ id }, { $set: set });
        const listing = await db.collection('listings').findOne({ id }, { projection: { _id: 0 } });
        return json({ listing });
      }

      if (path.startsWith('/admin/listings/') && method === 'DELETE') {
        await db.collection('listings').deleteOne({ id: pathArr[2] });
        return json({ ok: true });
      }

      if (path === '/admin/contributions' && method === 'GET') {
        const items = await db.collection('contributions')
          .find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
        return json({ contributions: items });
      }

      if (path === '/admin/users' && method === 'GET') {
        const users = await db.collection('users').find({}, { projection: { _id: 0, passwordHash: 0 } })
          .sort({ createdAt: -1 }).limit(200).toArray();
        return json({ users });
      }

      if (path === '/admin/connects' && method === 'GET') {
        const items = await db.collection('connect_requests')
          .find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
        return json({ connects: items });
      }

      if (path === '/admin/charity' && method === 'GET') {
        const t = await totals(db);
        const items = await db.collection('charity').find({}, { projection: { _id: 0 } })
          .sort({ createdAt: -1 }).limit(100).toArray();
        const given = items.reduce((s, i) => s + i.amount, 0);
        return json({
          charityPool: t.charityPool,
          charityGiven: given,
          charityRemaining: Math.max(0, t.charityPool - given),
          items, split: SPLIT,
        });
      }

      if (path === '/admin/charity' && method === 'POST') {
        const { amount, beneficiary, note } = await request.json();
        const amt = Math.floor(Number(amount));
        if (!Number.isFinite(amt) || amt < 1) return json({ error: 'Amount must be at least ₹1' }, 400);
        if (!beneficiary) return json({ error: 'beneficiary required' }, 400);
        const t = await totals(db);
        const givenAgg = await db.collection('charity').aggregate([
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).toArray();
        const remaining = Math.max(0, t.charityPool - (givenAgg[0]?.total || 0));
        if (amt > remaining) return json({ error: `Only ${remaining} left in the 40% help fund` }, 400);
        const record = {
          id: uuidv4(), amount: amt, beneficiary: String(beneficiary).slice(0, 120),
          note: String(note || '').slice(0, 300), by: user.email, createdAt: new Date(),
        };
        await db.collection('charity').insertOne(record);
        return json({ ok: true, record, charityRemaining: remaining - amt });
      }

      if (path === '/admin/payouts' && method === 'GET') {
        const raw = await db.collection('listings').find({ totalRaised: { $gt: 0 } }, { projection: { _id: 0 } })
          .sort({ totalRaised: -1 }).limit(200).toArray();
        const enriched = await enrichListings(db, raw);
        const rows = enriched.map(l => ({
          listingId: l.id, name: l.name, logo: l.logo, category: l.category,
          raised: l.raised, share: l.creatorShare, paidOut: l.paidOut,
          due: Math.max(0, l.creatorShare - l.paidOut),
        }));
        const history = await db.collection('payouts').find({}, { projection: { _id: 0 } })
          .sort({ createdAt: -1 }).limit(50).toArray();
        return json({ payouts: rows, history, creatorSharePct: CREATOR_SHARE * 100 });
      }

      if (path === '/admin/payouts' && method === 'POST') {
        const { listingId, amount } = await request.json();
        const listing = await db.collection('listings').findOne({ id: listingId });
        if (!listing) return json({ error: 'listing not found' }, 404);
        const [enriched] = await enrichListings(db, [listing]);
        const due = Math.max(0, enriched.creatorShare - enriched.paidOut);
        const amt = Math.floor(Number(amount || due));
        if (amt < 1) return json({ error: 'Nothing due for payout' }, 400);
        if (amt > due) return json({ error: `Max payable is ₹${due}` }, 400);
        const payout = {
          id: uuidv4(), listingId, listingName: listing.name, amount: amt,
          status: 'PAID', method: 'MOCK', paidBy: user.email, createdAt: new Date(),
        };
        await db.collection('payouts').insertOne(payout);
        return json({ ok: true, payout });
      }
    }

    return json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message }, 500);
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
