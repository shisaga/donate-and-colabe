import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { stripeEnabled, stripeMode, STRIPE_MIN_INR, createCheckoutSession, retrieveCheckoutSession, verifyWebhook } from '@/lib/stripe';
import { CURRENCIES, COUNTRY_CURRENCY, BASE_CURRENCY, currencyOf, toBase, toMinorUnits } from '@/lib/money';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'donate_colab';

const MIN_INCREMENT = 100;                 // INR: minimum extra to take a rank
const PLATFORM_FEE_PCT = 0.10;             // shown at checkout; does not count toward rank
const COMPETITION_PERIOD_MS = 24 * 60 * 60 * 1000; // MVP: 24 hours
const FREE_LISTING_LIMIT = 100;

// Legacy split kept only so old admin records still render. Not part of PayToTrend.
const CREATOR_SHARE = 0;
const CHARITY_SHARE = 0;
const PLATFORM_SHARE = 1;

async function listingQuota(db) {
  const used = await db.collection('listings').countDocuments({
    status: { $ne: 'REJECTED' },
    ownerId: { $ne: null },
  });
  const remaining = Math.max(0, FREE_LISTING_LIMIT - used);
  return {
    limit: FREE_LISTING_LIMIT,
    used,
    remaining,
    freeOpen: remaining > 0,
    nextNumber: Math.min(used + 1, FREE_LISTING_LIMIT),
  };
}

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

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const parts = raw.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function publicOrigin(request) {
  const url = new URL(request.url);
  const headerHost = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(headerHost);
  if (isLocal) {
    return `${url.protocol}//${headerHost}`.replace(/\/$/, '');
  }
  if (headerHost) {
    const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    return `${proto}://${headerHost}`.replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_BASE_URL || url.origin).replace(/\/$/, '');
}

function googleRedirectUri(request) {
  return `${publicOrigin(request)}/auth/callback`;
}

async function upsertGoogleUser(db, profile) {
  const email = String(profile?.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('Google did not return an email');
    err.status = 401;
    throw err;
  }
  const name = profile?.name || email.split('@')[0];
  const picture = profile?.picture || '';
  let user = await db.collection('users').findOne({ email });
  if (!user) {
    user = {
      id: uuidv4(), name, email, passwordHash: null, role: 'user',
      provider: 'google', picture, createdAt: new Date(),
    };
    await db.collection('users').insertOne(user);
  } else {
    await db.collection('users').updateOne({ id: user.id }, {
      $set: { provider: user.provider || 'google', picture: picture || user.picture || '' },
    });
    user = await db.collection('users').findOne({ id: user.id });
  }
  const token = await createSession(db, user.id);
  return { token, user: publicUser(user) };
}

/* ------------------------- static config ------------------------- */
const PLANS = {
  spark:   { id: 'spark',   name: 'Spark',   duration: 24 * 60 * 60 * 1000,      price: 1,   label: 'from ₹1 • 24 hours' },
  starter: { id: 'starter', name: 'Starter', duration: 3 * 24 * 60 * 60 * 1000,  price: 49,  label: '3 days' },
  weekly:  { id: 'weekly',  name: 'Believer',duration: 7 * 24 * 60 * 60 * 1000,  price: 199, label: '7 days' },
  monthly: { id: 'monthly', name: 'Investor',duration: 30 * 24 * 60 * 60 * 1000, price: 599, label: '30 days' },
};

const CATEGORIES = [
  { id: 'instagram',  name: 'Instagram',  slug: 'instagram',  emoji: '📸', color: '#FF5DA2' },
  { id: 'creators',   name: 'Creators',   slug: 'creators',   emoji: '🎨', color: '#B285FF' },
  { id: 'businesses', name: 'Businesses', slug: 'businesses', emoji: '🏢', color: '#4DD4E6' },
  { id: 'artists',    name: 'Artists',    slug: 'artists',    emoji: '🎵', color: '#FF5DA2' },
  { id: 'startups',   name: 'Startups',   slug: 'startups',   emoji: '🚀', color: '#FF5C4D' },
  { id: 'products',   name: 'Products',   slug: 'products',   emoji: '🛍', color: '#FFB84D' },
];

const SEED_LISTINGS = [
  { name: '@reelqueen.ananya', displayName: 'Ananya Rao', tagline: 'Daily reels • fashion & beauty', category: 'instagram', logo: '👑', website: 'https://instagram.com/reelqueen.ananya', handle: 'reelqueen.ananya', network: 'instagram', raised: 5200, views: 12430, clicks: 1240, type: 'PROFILE' },
  { name: '@streetfoodwala',   displayName: 'Rahul Khana', tagline: 'Street food raids across India', category: 'instagram', logo: '🍜', website: 'https://instagram.com/streetfoodwala', handle: 'streetfoodwala', network: 'instagram', raised: 5000, views: 9820, clicks: 980, type: 'PROFILE' },
  { name: '@fitwithrohan',     displayName: 'Rohan Fit', tagline: 'Home workouts • no gym needed', category: 'instagram', logo: '💪', website: 'https://instagram.com/fitwithrohan', handle: 'fitwithrohan', network: 'instagram', raised: 4100, views: 7420, clicks: 610, type: 'PROFILE' },
  { name: '@wander.with.mira', displayName: 'Mira Sen', tagline: 'Solo travel diaries', category: 'instagram', logo: '🌍', website: 'https://instagram.com/wander.with.mira', handle: 'wander.with.mira', network: 'instagram', raised: 2240, views: 5310, clicks: 420, type: 'PROFILE' },
  { name: '@memeboy.official', displayName: 'Meme Boy', tagline: 'Desi memes • daily drops', category: 'instagram', logo: '😂', website: 'https://instagram.com/memeboy.official', handle: 'memeboy.official', network: 'instagram', raised: 1320, views: 8900, clicks: 1100, type: 'PROFILE' },
  { name: '@thecoffeediary',   displayName: 'The Coffee Diary', tagline: 'Cafe reviews + brewing tips', category: 'instagram', logo: '☕', website: 'https://instagram.com/thecoffeediary', handle: 'thecoffeediary', network: 'instagram', raised: 860, views: 2100, clicks: 180, type: 'PROFILE' },

  { name: '@aria.builds',   displayName: 'Aria', tagline: 'Building in public', category: 'creators', logo: '🌟', website: 'https://instagram.com/aria.builds', handle: 'aria.builds', network: 'instagram', raised: 1850, views: 4200, clicks: 310, type: 'PROFILE' },
  { name: '@makerkev',      displayName: 'Maker Kev', tagline: 'Indie hacker • product clips', category: 'creators', logo: '😎', website: 'https://instagram.com/makerkev', handle: 'makerkev', network: 'instagram', raised: 900, views: 1800, clicks: 140, type: 'PROFILE' },
  { name: '@zoe.codes',     displayName: 'Zoe', tagline: 'Shipping fast • creator tools', category: 'creators', logo: '👩‍💻', website: 'https://instagram.com/zoe.codes', handle: 'zoe.codes', network: 'instagram', raised: 250, views: 960, clicks: 70, type: 'PROFILE' },

  { name: 'InvoiceZap',  displayName: 'InvoiceZap', tagline: 'Send invoices in 10 seconds', category: 'businesses', logo: '💸', website: 'https://instagram.com/invoicezap', handle: 'invoicezap', network: 'instagram', raised: 3400, views: 6100, clicks: 520 },
  { name: 'DeskFlow',    displayName: 'DeskFlow', tagline: 'Support inbox, rebuilt', category: 'businesses', logo: '📬', website: 'https://instagram.com/deskflow', handle: 'deskflow', network: 'instagram', raised: 1999, views: 2800, clicks: 210 },
  { name: 'CRMly',       displayName: 'CRMly', tagline: 'CRM founders actually use', category: 'businesses', logo: '📊', website: 'https://instagram.com/crmly', handle: 'crmly', network: 'instagram', raised: 1200, views: 1500, clicks: 90 },

  { name: '@sketch.by.dev',  displayName: 'Dev Sketch', tagline: 'Pencil art timelapses', category: 'artists', logo: '✏️', website: 'https://instagram.com/sketch.by.dev', handle: 'sketch.by.dev', network: 'instagram', raised: 1780, views: 6400, clicks: 540, type: 'PROFILE' },
  { name: '@dance.with.sia', displayName: 'Sia Dance', tagline: 'Choreography reels', category: 'artists', logo: '💃', website: 'https://instagram.com/dance.with.sia', handle: 'dance.with.sia', network: 'instagram', raised: 1410, views: 7200, clicks: 880, type: 'PROFILE' },
  { name: '@design.daily',   displayName: 'Design Daily', tagline: 'UI teardowns every morning', category: 'artists', logo: '🎨', website: 'https://instagram.com/designdaily', handle: 'designdaily', network: 'instagram', raised: 640, views: 1900, clicks: 150, type: 'PROFILE' },

  { name: 'GreenLeaf',  displayName: 'GreenLeaf', tagline: 'Climate-first billing', category: 'startups', logo: '🌱', website: 'https://instagram.com/greenleaf', handle: 'greenleaf', network: 'instagram', raised: 3100, views: 4400, clicks: 300 },
  { name: 'RocketDocs', displayName: 'RocketDocs', tagline: 'Docs for shipping teams', category: 'startups', logo: '📚', website: 'https://instagram.com/rocketdocs', handle: 'rocketdocs', network: 'instagram', raised: 1700, views: 2200, clicks: 160 },
  { name: 'FundedFast', displayName: 'FundedFast', tagline: 'Founders meeting angels', category: 'startups', logo: '🚀', website: 'https://instagram.com/fundedfast', handle: 'fundedfast', network: 'instagram', raised: 900, views: 1100, clicks: 80 },

  { name: 'NeuroWrite',    displayName: 'NeuroWrite', tagline: 'AI copy that never sleeps', category: 'products', logo: '✍️', website: 'https://instagram.com/neurowrite', handle: 'neurowrite', network: 'instagram', raised: 2500, views: 3800, clicks: 290 },
  { name: 'PixelForge AI', displayName: 'PixelForge', tagline: 'Product photos in seconds', category: 'products', logo: '🖼️', website: 'https://instagram.com/pixelforge', handle: 'pixelforge', network: 'instagram', raised: 1700, views: 2100, clicks: 175 },
  { name: 'ClipGenie',     displayName: 'ClipGenie', tagline: 'Shorts from long videos', category: 'products', logo: '🎬', website: 'https://instagram.com/clipgenie', handle: 'clipgenie', network: 'instagram', raised: 199, views: 800, clicks: 40 },
];

const BACKER_NAMES = ['Aarav', 'Priya', 'Rohit', 'Sneha', 'Kabir', 'Meera', 'Dev', 'Ishita', 'Arjun', 'Nisha', 'Vikram', 'Tara', 'Anonymous Angel', 'Zoya', 'Sam'];

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}
function creatorShare(raised) { return Math.round((raised || 0) * CREATOR_SHARE); }
function charityShare(raised) { return Math.round((raised || 0) * CHARITY_SHARE); }
function platformShare(raised) { return (raised || 0) - creatorShare(raised) - charityShare(raised); }
function platformFeeOn(amount) { return Math.round((amount || 0) * PLATFORM_FEE_PCT); }
const SPLIT = {
  creatorPct: CREATOR_SHARE * 100,
  charityPct: CHARITY_SHARE * 100,
  platformPct: PLATFORM_SHARE * 100,
  feePct: PLATFORM_FEE_PCT * 100,
  minIncrement: MIN_INCREMENT,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withCategoryLock(db, category, fn) {
  const _id = 'lock:rank:' + (category || 'all');
  const ttlMs = 12000;
  for (let attempt = 0; attempt < 25; attempt++) {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    try {
      const existing = await db.collection('locks').findOne({ _id });
      if (!existing) {
        await db.collection('locks').insertOne({ _id, expiresAt });
      } else if (existing.expiresAt <= now) {
        const res = await db.collection('locks').updateOne(
          { _id, expiresAt: existing.expiresAt },
          { $set: { expiresAt } }
        );
        if (!res.modifiedCount) {
          await sleep(80 + Math.random() * 120);
          continue;
        }
      } else {
        await sleep(80 + Math.random() * 120);
        continue;
      }
      try {
        return await fn();
      } finally {
        await db.collection('locks').updateOne({ _id }, { $set: { expiresAt: 0 } });
      }
    } catch (e) {
      if (e.code !== 11000) throw e;
      await sleep(80 + Math.random() * 120);
    }
  }
  const err = new Error('This rank is being challenged right now. Try again in a moment.');
  err.status = 409;
  err.code = 'RANK_BUSY';
  throw err;
}

function minBidForTarget(ranked, myId, targetRank) {
  const me = myId ? ranked.find(l => l.id === myId) : null;
  const myScore = me?.score || 0;
  const idx = Math.max(0, (Number(targetRank) || 1) - 1);
  const target = ranked[idx];
  if (!ranked.length) return MIN_INCREMENT;
  if (!target) {
    const last = ranked[ranked.length - 1];
    return Math.max(MIN_INCREMENT, (last?.score || 0) - myScore + MIN_INCREMENT);
  }
  if (myId && target.id === myId) return MIN_INCREMENT;
  return Math.max(MIN_INCREMENT, (target.score || 0) - myScore + MIN_INCREMENT);
}

function publicListingExtras(ranked) {
  return ranked.map((l, i) => {
    const above = i > 0 ? ranked[i - 1] : null;
    const below = ranked[i + 1] || null;
    const gapBehind = above ? Math.max(0, (above.score || 0) - (l.score || 0)) : 0;
    const leadOverNext = below ? Math.max(0, (l.score || 0) - (below.score || 0)) : 0;
    return {
      ...l,
      rank: i + 1,
      displayName: l.displayName || l.name,
      handle: l.handle || String(l.name || '').replace(/^@/, ''),
      views: l.views || 0,
      clicks: l.clicks || 0,
      gapBehind,
      leadOverNext,
      toTakeThis: (l.score || 0) + MIN_INCREMENT,
      toTakeOne: i === 0 ? 0 : Math.max(MIN_INCREMENT, (ranked[0].score || 0) - (l.score || 0) + MIN_INCREMENT),
      toBeatAbove: above ? Math.max(MIN_INCREMENT, above.score - (l.score || 0) + MIN_INCREMENT) : 0,
      toBeatTop: i === 0 ? 0 : Math.max(MIN_INCREMENT, (ranked[0].score || 0) - (l.score || 0) + MIN_INCREMENT),
      aboveName: above?.name || '',
      topName: ranked[0]?.name || '',
      isTop: i === 0,
      trendingUntil: l.trendingUntil || null,
    };
  });
}

async function rankedCategory(db, category) {
  const q = { status: { $ne: 'REJECTED' } };
  if (category && category !== 'all') q.category = category;
  const listings = await db.collection('listings').find(q, { projection: { _id: 0 } }).toArray();
  const enriched = await enrichListings(db, listings);
  enriched.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    const aPaid = a.lastPaidAt ? new Date(a.lastPaidAt).getTime() : 0;
    const bPaid = b.lastPaidAt ? new Date(b.lastPaidAt).getTime() : 0;
    if (aPaid !== bPaid) return aPaid - bPaid; // first to reach this score wins
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return publicListingExtras(enriched);
}

async function quoteChallenge(db, { category, listingId, targetRank = 1 }) {
  const ranked = await rankedCategory(db, category);
  const me = listingId ? ranked.find(l => l.id === listingId) : null;
  const rank = Math.max(1, Math.min(5, Number(targetRank) || 1));
  const holder = ranked[rank - 1] || null;
  const minBid = minBidForTarget(ranked, listingId, rank);
  const myAmount = me?.score || 0;
  const newTotal = myAmount + minBid;
  const fee = platformFeeOn(minBid);
  return {
    category,
    targetRank: rank,
    listingId: listingId || null,
    myRank: me?.rank || null,
    myAmount,
    currentHolder: holder ? { id: holder.id, name: holder.name, handle: holder.handle, amount: holder.score, rank: holder.rank } : null,
    currentAmount: holder?.score || 0,
    minBid,
    minIncrement: MIN_INCREMENT,
    newTotal,
    platformFee: fee,
    platformFeePct: PLATFORM_FEE_PCT * 100,
    totalCharge: minBid + fee,
    top5: ranked.slice(0, 5).map(l => ({
      id: l.id, rank: l.rank, name: l.name, handle: l.handle, amount: l.score, image: l.image || '', logo: l.logo,
    })),
    isDefend: !!(me && me.rank && me.rank > rank),
    empty: ranked.length === 0,
  };
}

async function ensureBattle(db) {
  const now = new Date();
  let b = await db.collection('meta').findOne({ _id: 'battle' });
  if (!b) {
    b = {
      _id: 'battle',
      periodMs: COMPETITION_PERIOD_MS,
      startAt: now,
      endAt: new Date(now.getTime() + COMPETITION_PERIOD_MS),
      label: '24-HOUR TRENDING BATTLE',
    };
    await db.collection('meta').insertOne(b);
    return b;
  }
  if (now >= new Date(b.endAt)) {
    const ranked = await rankedCategory(db, 'all');
    const winners = ranked.slice(0, 3).map(l => ({
      rank: l.rank, listingId: l.id, name: l.name, handle: l.handle, logo: l.logo,
      image: l.image || '', amount: l.score, views: l.views || 0,
    }));
    await db.collection('hall_of_fame').insertOne({
      id: uuidv4(),
      periodStart: b.startAt,
      periodEnd: b.endAt,
      winners,
      createdAt: now,
    });
    const startAt = now;
    const endAt = new Date(now.getTime() + (b.periodMs || COMPETITION_PERIOD_MS));
    await db.collection('meta').updateOne({ _id: 'battle' }, { $set: { startAt, endAt } });
    return { ...b, startAt, endAt, justRolled: true, lastWinners: winners };
  }
  return b;
}

async function notifyRankShifts(db, beforeMap, afterRanked, challenger) {
  const now = new Date();
  for (const after of afterRanked) {
    const prev = beforeMap[after.id];
    if (!prev) continue;
    if (after.rank < (prev.highestRank || prev.rank || 999)) {
      await db.collection('listings').updateOne({ id: after.id }, { $set: { highestRank: after.rank } });
    }
    if (prev.rank === 1 && after.rank > 1) {
      await db.collection('listings').updateOne({ id: after.id }, {
        $inc: { timesOvertaken: 1 },
        $set: { numberOneSince: null },
      });
      if (after.ownerId) {
        const holdMs = prev.numberOneSince ? Math.max(0, now.getTime() - new Date(prev.numberOneSince).getTime()) : 0;
        if (holdMs) await db.collection('listings').updateOne({ id: after.id }, { $inc: { numberOneMs: holdMs } });
        const defendQuote = await quoteChallenge(db, {
          category: after.category, listingId: after.id, targetRank: 1,
        });
        await db.collection('notifications').insertOne({
          id: uuidv4(),
          userId: after.ownerId,
          type: 'OVERTAKEN',
          listingId: after.id,
          listingName: after.name,
          fromRank: 1,
          toRank: after.rank,
          challengerName: challenger?.name || 'Someone',
          challengerHandle: challenger?.handle || '',
          currentAmount: defendQuote.currentAmount,
          defendAmount: defendQuote.minBid,
          defendTotal: defendQuote.newTotal,
          read: false,
          createdAt: now,
        });
      }
    }
    if (after.rank === 1 && prev.rank !== 1) {
      await db.collection('listings').updateOne({ id: after.id }, { $set: { numberOneSince: now, highestRank: 1 } });
    }
  }
}

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
      views: l.views || 0,
      clicks: l.clicks || 0,
      timesOvertaken: l.timesOvertaken || 0,
      highestRank: l.highestRank || null,
      numberOneMs: l.numberOneMs || 0,
      numberOneSince: l.numberOneSince || null,
      displayName: l.displayName || l.name,
      handle: l.handle || String(l.name || '').replace(/^@/, ''),
      boost,
      score: raised + boost,
      creatorShare: creatorShare(raised),
      paidOut: paidMap[l.id] || 0,
      sponsored: boost > 0,
      promotionExpiry: expiryMap[l.id] || l.trendingUntil || null,
      trendingUntil: l.trendingUntil || expiryMap[l.id] || null,
    };
  });
}

function sortByScore(listings) {
  return [...listings].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

async function rankSnapshot(db, listing) {
  const sameCat = await db.collection('listings')
    .find({ category: listing.category, status: { $ne: 'REJECTED' } }).toArray();
  const ranked = sortByScore(await enrichListings(db, sameCat));
  const idx = ranked.findIndex(l => l.id === listing.id);
  const me = ranked[idx] || { score: 0 };
  const top = ranked[0];
  const above = idx > 0 ? ranked[idx - 1] : null;
  return {
    rank: idx >= 0 ? idx + 1 : ranked.length,
    categoryCount: ranked.length,
    myScore: me.score || 0,
    topName: top?.name || '',
    topScore: top?.score || 0,
    aboveName: above?.name || '',
    toBeatTop: idx === 0 ? 0 : Math.max(MIN_INCREMENT, (top?.score || 0) - (me.score || 0) + MIN_INCREMENT),
    toBeatAbove: above ? Math.max(MIN_INCREMENT, above.score - (me.score || 0) + MIN_INCREMENT) : 0,
    isTop: idx === 0,
  };
}

async function attachRanks(db, listings) {
  const cats = [...new Set(listings.map(l => l.category).filter(Boolean))];
  const extra = {};
  await Promise.all(cats.map(async (cat) => {
    const sameCat = await db.collection('listings')
      .find({ category: cat, status: { $ne: 'REJECTED' } }).toArray();
    const ranked = sortByScore(await enrichListings(db, sameCat));
    ranked.forEach((item, i) => {
      extra[item.id] = {
        rank: i + 1,
        categoryCount: ranked.length,
        isTop: i === 0,
        aboveName: i > 0 ? ranked[i - 1].name : '',
        topName: ranked[0]?.name || '',
        toBeatTop: i === 0 ? 0 : Math.max(MIN_INCREMENT, ranked[0].score - item.score + MIN_INCREMENT),
        toBeatAbove: i > 0 ? Math.max(MIN_INCREMENT, ranked[i - 1].score - item.score + MIN_INCREMENT) : 0,
      };
    });
  }));
  return listings.map(l => ({ ...l, ...(extra[l.id] || { rank: null }) }));
}


/* ------------------------- crediting a payment (shared by MOCK + Stripe) ------------------------- */
async function applyContribution(db, opts) {
  const { listing, amount, kind, user, backerName, message, anonymous, plan, provider, providerRef, paymentId, targetRank } = opts;
  const now = new Date();
  const cat = listing.category;

  return withCategoryLock(db, cat, async () => {
    const fresh = await db.collection('listings').findOne({ id: listing.id });
    if (!fresh) throw new Error('listing not found');

    const beforeRanked = await rankedCategory(db, cat);
    const beforeMap = Object.fromEntries(beforeRanked.map(l => [l.id, l]));
    const quote = await quoteChallenge(db, {
      category: cat,
      listingId: fresh.id,
      targetRank: targetRank || 1,
    });

    const contribution = {
      id: uuidv4(),
      listingId: fresh.id,
      listingName: fresh.name,
      userId: user?.id || null,
      kind: kind === 'DONATION' ? 'SELF_PAY' : (kind || 'SELF_PAY'),
      backerName: backerName || user?.name || fresh.name,
      amount,
      fee: platformFeeOn(amount),
      message: String(message || '').slice(0, 200),
      provider: provider || 'MOCK',
      providerRef: providerRef || null,
      status: 'SUCCESS',
      paymentId: paymentId || null,
      createdAt: now,
    };
    await db.collection('contributions').insertOne(contribution);

    const trendingUntil = new Date(now.getTime() + COMPETITION_PERIOD_MS);
    const inc = { totalRaised: amount, backers: 1, selfPaid: amount };
    await db.collection('listings').updateOne({ id: fresh.id }, {
      $inc: inc,
      $set: { lastPaidAt: now, trendingUntil },
    });

    const eventType = (beforeMap[fresh.id]?.rank === 1) ? 'DEFENDED' : 'TOOK_RANK';
    await db.collection('rank_events').insertOne({
      id: uuidv4(), listingId: fresh.id, listingName: fresh.name,
      eventType, amount, backerName: contribution.backerName, recordedAt: now,
      targetRank: targetRank || 1,
    });

    if (plan && PLANS[plan]) {
      const pl = PLANS[plan];
      await db.collection('promotions').insertOne({
        id: uuidv4(), listingId: fresh.id, paymentId: paymentId || null, plan: pl.id, amount,
        startAt: now, endAt: new Date(now.getTime() + pl.duration), active: true, createdAt: now,
      });
    }

    const afterRanked = await rankedCategory(db, cat);
    const updated = afterRanked.find(l => l.id === fresh.id);
    const newRank = updated?.rank || afterRanked.length;
    const missedTarget = quote.targetRank && newRank > quote.targetRank;

    await notifyRankShifts(db, beforeMap, afterRanked, {
      ...fresh, handle: fresh.handle || String(fresh.name || '').replace(/^@/, ''),
    });

    if (newRank === 1) {
      await db.collection('listings').updateOne({ id: fresh.id }, {
        $set: { numberOneSince: now, highestRank: 1 },
      });
    } else if (updated && (!updated.highestRank || newRank < updated.highestRank)) {
      await db.collection('listings').updateOne({ id: fresh.id }, { $set: { highestRank: newRank } });
    }

    const freshQuote = await quoteChallenge(db, { category: cat, listingId: fresh.id, targetRank: 1 });

    return {
      contribution,
      newRank,
      previousRank: beforeMap[fresh.id]?.rank || null,
      totalRaised: updated?.raised || amount,
      selfPaid: updated?.selfPaid || amount,
      donated: 0,
      creatorShare: 0,
      quoteAtPay: quote,
      quoteNow: freshQuote,
      missedTarget: !!missedTarget,
      minBidWas: quote.minBid,
      amountApplied: amount,
      movedUp: beforeMap[fresh.id] ? Math.max(0, (beforeMap[fresh.id].rank || newRank) - newRank) : 0,
    };
  });
}

/* ------------------------- seeding ------------------------- */
const SEED_VERSION = 6;
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
    for (const c of ['listings', 'promotions', 'contributions', 'rank_events', 'payments', 'payouts', 'notifications', 'hall_of_fame']) {
      await db.collection(c).deleteMany({});
    }
    const now = new Date();
    await db.collection('meta').updateOne(
      { _id: 'battle' },
      { $set: { periodMs: COMPETITION_PERIOD_MS, startAt: now, endAt: new Date(now.getTime() + COMPETITION_PERIOD_MS), label: '24-HOUR TRENDING BATTLE' } },
      { upsert: true }
    );
    const listings = [];
    const contributions = [];
    const promotions = [];
    const events = [];
    for (const s of SEED_LISTINGS) {
      const id = uuidv4();
      const selfPaid = s.raised;
      const donatedTotal = 0;
      listings.push({
        id,
        type: s.type || 'PROFILE',
        name: s.name,
        displayName: s.displayName || s.name,
        slug: slugify(s.name),
        tagline: s.tagline,
        description: s.tagline,
        logo: s.logo,
        website: s.website,
        handle: s.handle || String(s.name || '').replace(/^@/, ''),
        network: s.network || 'instagram',
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
        backers: 1,
        connects: Math.floor(Math.random() * 40),
        views: s.views || Math.floor(Math.random() * 5000) + 200,
        clicks: s.clicks || Math.floor(Math.random() * 400) + 20,
        timesOvertaken: Math.floor(Math.random() * 6),
        highestRank: 1,
        numberOneMs: Math.floor(Math.random() * 8 * 3600000),
        trendingUntil: new Date(now.getTime() + (4 + Math.floor(Math.random() * 20)) * 3600 * 1000),
        lastPaidAt: new Date(now.getTime() - Math.floor(Math.random() * 12 * 3600 * 1000)),
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
      events.push({
        id: uuidv4(), listingId: id, listingName: s.name, eventType: 'TOOK_RANK',
        backerName: s.name, amount: selfPaid, recordedAt: new Date(now.getTime() - Math.floor(Math.random() * 8 * 3600 * 1000)),
      });
      if (s.raised > 1000) {
        promotions.push({
          id: uuidv4(), listingId: id, plan: 'weekly', amount: Math.round(s.raised * 0.15),
          startAt: now, endAt: new Date(now.getTime() + (2 + Math.floor(Math.random() * 6)) * 24 * 3600 * 1000),
          active: true, createdAt: now,
        });
      }
    }
    // give the global #1 a defend window that looks live
    if (listings[0]) {
      listings[0].trendingUntil = new Date(now.getTime() + (18 * 3600 + 42 * 60) * 1000);
      listings[0].numberOneSince = new Date(now.getTime() - 4 * 3600 * 1000);
    }
    await db.collection('hall_of_fame').insertOne({
      id: uuidv4(),
      periodStart: new Date(now.getTime() - 2 * COMPETITION_PERIOD_MS),
      periodEnd: new Date(now.getTime() - COMPETITION_PERIOD_MS),
      winners: listings.slice(0, 3).map((l, i) => ({
        rank: i + 1, listingId: l.id, name: l.name, handle: l.handle, logo: l.logo, amount: l.totalRaised, views: l.views,
      })),
      createdAt: new Date(now.getTime() - COMPETITION_PERIOD_MS),
    });
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
    kind: record.kind || 'SELF_PAY',
    user,
    backerName: record.backerName,
    message: record.message,
    anonymous: record.anonymous,
    plan: record.plan,
    provider: 'STRIPE',
    providerRef: session.payment_intent || sessionId,
    paymentId: record.id,
    targetRank: record.targetRank || 1,
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
  const viewAgg = await db.collection('listings').aggregate([
    { $match: { status: { $ne: 'REJECTED' } } },
    { $group: { _id: null, views: { $sum: { $ifNull: ['$views', 0] } }, clicks: { $sum: { $ifNull: ['$clicks', 0] } }, count: { $sum: 1 } } },
  ]).toArray();
  const boostAgg = await db.collection('promotions').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).toArray();
  const paidAgg = await db.collection('payouts').aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).toArray();
  const totalRaised = agg[0]?.total || 0;
  const now = new Date();
  const liveBattles = await db.collection('listings').countDocuments({
    status: { $ne: 'REJECTED' },
    trendingUntil: { $gt: now },
  });
  return {
    totalRaised,
    totalBackers: agg[0]?.backers || 0,
    totalViews: viewAgg[0]?.views || 0,
    totalClicks: viewAgg[0]?.clicks || 0,
    liveBattles,
    selfPaidTotal: totalRaised,
    donatedTotal: 0,
    donationCount: 0,
    totalBoosts: boostAgg[0]?.total || 0,
    creatorPool: 0,
    charityPool: 0,
    platformPool: totalRaised,
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
    await ensureBattle(db);

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

    // Google OAuth (authorization-code). Client secret never leaves the server.
    if (path === '/auth/google' && method === 'GET') {
      if (!googleOAuthConfigured()) {
        return json({ error: 'Google login is not configured on the server.' }, 503);
      }
      const state = crypto.randomBytes(16).toString('hex');
      const redirectUri = googleRedirectUri(request);
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account',
      });
      const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
      res.cookies.set('g_oauth_state', state, {
        httpOnly: true,
        secure: request.url.startsWith('https://'),
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
      return res;
    }

    if (path === '/auth/google/callback' && method === 'POST') {
      if (!googleOAuthConfigured()) {
        return json({ error: 'Google login is not configured on the server.' }, 503);
      }
      const { code, state } = await request.json();
      const expected = readCookie(request, 'g_oauth_state');
      if (!code) return json({ error: 'Missing Google authorization code' }, 400);
      if (!state || !expected || state !== expected) {
        return json({ error: 'Google login state mismatch. Please try again.' }, 401);
      }
      const redirectUri = googleRedirectUri(request);
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        cache: 'no-store',
      });
      const tokenPayload = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenPayload.access_token) {
        return json({ error: tokenPayload.error_description || 'Google did not accept this login. Check the redirect URI in Google Cloud.' }, 401);
      }
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
        cache: 'no-store',
      });
      const profile = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok) return json({ error: 'Could not read your Google profile' }, 401);
      const out = await upsertGoogleUser(db, profile);
      const res = json(out);
      res.cookies.set('g_oauth_state', '', { httpOnly: true, maxAge: 0, path: '/' });
      return res;
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
      const battle = await ensureBattle(db);
      return json({
        ...t,
        totalListings,
        activeProfiles: totalListings,
        activePromos,
        viewersOnline: 30 + Math.floor(Math.random() * 80),
        listingQuota: await listingQuota(db),
        minIncrement: MIN_INCREMENT,
        platformFeePct: PLATFORM_FEE_PCT * 100,
        battle: {
          label: battle.label || '24-HOUR TRENDING BATTLE',
          startAt: battle.startAt,
          endAt: battle.endAt,
          periodMs: battle.periodMs || COMPETITION_PERIOD_MS,
        },
      });
    }

    if (path === '/listings/quota' && method === 'GET') {
      return json(await listingQuota(db));
    }

    if (path === '/rankings' && method === 'GET') {
      const category = url.searchParams.get('category') || 'all';
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const ranked = await rankedCategory(db, category);
      const battle = await ensureBattle(db);
      return json({
        rankings: ranked.slice(0, limit),
        minIncrement: MIN_INCREMENT,
        battle: { label: battle.label, startAt: battle.startAt, endAt: battle.endAt },
      });
    }

    if (path === '/challenge/quote' && method === 'GET') {
      const category = url.searchParams.get('category') || 'instagram';
      const listingId = url.searchParams.get('listingId') || null;
      const targetRank = parseInt(url.searchParams.get('targetRank') || '1');
      const quote = await quoteChallenge(db, { category, listingId, targetRank });
      return json(quote);
    }

    if (path === '/hall-of-fame' && method === 'GET') {
      const items = await db.collection('hall_of_fame')
        .find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(12).toArray();
      return json({ hall: items });
    }

    if (path === '/trending/instagram' && method === 'GET') {
      const ranked = await rankedCategory(db, 'instagram');
      return json({ trending: ranked.slice(0, 6) });
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

    if (path.startsWith('/listings/') && pathArr.length === 3 && (pathArr[2] === 'click' || pathArr[2] === 'view') && method === 'POST') {
      const listingId = pathArr[1];
      const field = pathArr[2] === 'click' ? 'clicks' : 'views';
      const listing = await db.collection('listings').findOne({ id: listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      await db.collection('listings').updateOne({ id: listingId }, { $inc: { [field]: 1 } });
      if (pathArr[2] === 'click') {
        await db.collection('rank_events').insertOne({
          id: uuidv4(), listingId, listingName: listing.name,
          eventType: 'SOCIAL_CLICK', amount: 0, recordedAt: new Date(),
        });
      }
      return json({ ok: true, id: listingId, [field]: (listing[field] || 0) + 1 });
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
      if (!user) return json({ error: 'Log in to start trending.' }, 401);
      const { type = 'PROFILE', name, tagline, description, logo, website, category, socials, contactEmail, image, network, handle, displayName, listFree } = body;
      if (!name || !category) return json({ error: 'name and category required' }, 400);
      const existing = await db.collection('listings').findOne({ ownerId: user.id, category, status: { $ne: 'REJECTED' } });
      if (existing) {
        const ranked = await rankedCategory(db, category);
        const mine = ranked.find(l => l.id === existing.id) || { ...existing, rank: null };
        const quote = await quoteChallenge(db, { category, listingId: existing.id, targetRank: 1 });
        return json({ listing: mine, existing: true, quote, quota: await listingQuota(db) });
      }
      const quota = await listingQuota(db);
      if (listFree !== false && !quota.freeOpen) {
        return json({
          error: 'Free listing slots are full. Pay to enter the battle.',
          code: 'FREE_SLOTS_FULL',
          quota,
        }, 402);
      }
      const cleanHandle = String(handle || name || '').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
      const listing = {
        id: uuidv4(), type, name, slug: slugify(name),
        displayName: displayName || name,
        tagline: tagline || '', description: description || tagline || '',
        logo: logo || '🔥', website: website || (cleanHandle ? `https://instagram.com/${cleanHandle}` : ''),
        image: image || '',
        network: network || 'instagram',
        handle: cleanHandle,
        imageVerified: false,
        contactEmail: contactEmail || user.email || '',
        category, socials: socials || {},
        status: 'APPROVED', verified: false, foundingBadge: quota.freeOpen,
        ownerId: user.id,
        totalRaised: 0, backers: 0, connects: 0,
        views: 0, clicks: 0, timesOvertaken: 0, highestRank: null, numberOneMs: 0,
        createdAt: new Date(),
      };
      await db.collection('listings').insertOne(listing);
      await db.collection('rank_events').insertOne({
        id: uuidv4(), listingId: listing.id, listingName: listing.name,
        eventType: 'ENTERED', amount: 0, backerName: listing.name, recordedAt: new Date(),
      });
      const snap = await rankSnapshot(db, listing);
      const quote = await quoteChallenge(db, { category, listingId: listing.id, targetRank: 1 });
      return json({
        listing: {
          ...listing,
          raised: 0,
          score: 0,
          newRank: snap.rank,
          ...snap,
        },
        quote,
        quota: await listingQuota(db),
      });
    }

    /* ---------- pay to take / defend a rank (MOCK fallback) ---------- */
    if (path === '/support' && method === 'POST') {
      const body = await request.json();
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Log in to compete for a rank.' }, 401);
      const listingId = body.listingId;
      const localAmount = Math.floor(Number(body.amount));
      const cur = currencyOf(body.currency || BASE_CURRENCY);
      const targetRank = Math.max(1, Math.min(5, Number(body.targetRank) || 1));
      if (!listingId) return json({ error: 'listingId required' }, 400);
      if (!Number.isFinite(localAmount) || localAmount < 1) {
        return json({ error: `Minimum amount is ${cur.symbol}1` }, 400);
      }
      const amount = cur.code === BASE_CURRENCY ? localAmount : toBase(localAmount, cur.code);
      const listing = await db.collection('listings').findOne({ id: listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      if (listing.ownerId !== user.id) {
        return json({ error: 'You can only pay to trend your own profile.' }, 403);
      }
      const quote = await quoteChallenge(db, { category: listing.category, listingId: listing.id, targetRank });
      if (amount < quote.minBid) {
        return json({
          error: `Too late — #${targetRank} now costs more. Minimum is ₹${quote.minBid}.`,
          code: 'AMOUNT_STALE',
          quote,
        }, 409);
      }

      const payment = {
        id: uuidv4(), listingId, userId: user.id, provider: 'MOCK',
        amount, currency: BASE_CURRENCY,
        localAmount, localCurrency: cur.code,
        fee: platformFeeOn(amount),
        status: 'SUCCESS', kind: 'SELF_PAY', targetRank, createdAt: new Date(),
      };
      await db.collection('payments').insertOne(payment);

      const res = await applyContribution(db, {
        listing, amount, kind: 'SELF_PAY', user,
        backerName: body.backerName || user.name, plan: body.plan,
        provider: 'MOCK', paymentId: payment.id, targetRank,
      });

      return json({
        ok: true, mode: 'MOCK', ...res, category: listing.category, kind: 'SELF_PAY', payment,
        localAmount, localCurrency: cur.code, baseAmount: amount,
        platformFee: platformFeeOn(amount),
        totalCharge: amount + platformFeeOn(amount),
      });
    }

    /* ---------- Stripe Checkout ---------- */
    if (path === '/payments/config' && method === 'GET') {
      return json({
        provider: stripeEnabled ? 'stripe' : 'mock', mode: stripeMode,
        cardMinAmount: STRIPE_MIN_INR, base: BASE_CURRENCY, live: false, sandbox: true,
        platformFeePct: PLATFORM_FEE_PCT * 100, minIncrement: MIN_INCREMENT,
      });
    }

    if (path === '/payments/checkout' && method === 'POST') {
      const body = await request.json();
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Log in to compete for a rank.' }, 401);
      const localAmount = Math.floor(Number(body.amount));
      const cur = currencyOf(body.currency || BASE_CURRENCY);
      const targetRank = Math.max(1, Math.min(5, Number(body.targetRank) || 1));
      if (!body.listingId) return json({ error: 'listingId required' }, 400);
      if (!Number.isFinite(localAmount) || localAmount < 1) {
        return json({ error: `Minimum amount is ${cur.symbol}1` }, 400);
      }
      const amount = cur.code === BASE_CURRENCY ? localAmount : toBase(localAmount, cur.code);
      const listing = await db.collection('listings').findOne({ id: body.listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      if (listing.ownerId !== user.id) {
        return json({ error: 'You can only pay to trend your own profile.' }, 403);
      }
      const quote = await quoteChallenge(db, { category: listing.category, listingId: listing.id, targetRank });
      if (amount < quote.minBid) {
        return json({
          error: `Too late — #${targetRank} now costs more. Minimum is ₹${quote.minBid}.`,
          code: 'AMOUNT_STALE',
          quote,
        }, 409);
      }
      if (!stripeEnabled) return json({ error: 'STRIPE_UNAVAILABLE', mode: 'MOCK' }, 503);

      const feeLocal = Math.round(localAmount * PLATFORM_FEE_PCT);
      const chargeLocal = localAmount + feeLocal;
      if (chargeLocal < cur.cardMin) {
        return json({
          error: `Card payments start at ${cur.symbol}${cur.cardMin} (Stripe's minimum). Smaller amounts are recorded in demo mode.`,
          code: 'BELOW_CARD_MIN', minAmount: cur.cardMin, currency: cur.code, mode: 'MOCK',
        }, 409);
      }

      const origin = publicOrigin(request);
      const paymentId = uuidv4();
      try {
        const { session, currency, unit } = await createCheckoutSession({
          amount: chargeLocal,
          currency: cur.code.toLowerCase(),
          minorUnits: toMinorUnits(chargeLocal, cur.code),
          name: `Take #${targetRank} — ${listing.name}`,
          description: `PayToTrend visibility: compete for #${targetRank} on the public leaderboard`,
          metadata: {
            paymentId, listingId: listing.id, kind: 'SELF_PAY', amount: String(amount),
            userId: user.id, plan: body.plan || '', targetRank: String(targetRank),
          },
          successUrl: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/pay/cancel`,
        });

        await db.collection('payments').insertOne({
          id: paymentId,
          listingId: listing.id,
          listingName: listing.name,
          userId: user.id,
          provider: 'STRIPE',
          sessionId: session.id,
          amount,
          fee: toBase(feeLocal, cur.code),
          localAmount,
          localCurrency: cur.code,
          chargeLocal,
          amountMinor: unit,
          currency: currency.toUpperCase(),
          kind: 'SELF_PAY',
          targetRank,
          plan: body.plan || '',
          message: String(body.message || '').slice(0, 200),
          anonymous: false,
          backerName: body.backerName || user.name || '',
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
      const targetRank = parseInt(url.searchParams.get('targetRank') || '1');
      if (!listingId) return json({ error: 'listingId required' }, 400);
      const listing = await db.collection('listings').findOne({ id: listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      const quote = await quoteChallenge(db, { category: listing.category, listingId, targetRank });
      const snap = await rankSnapshot(db, listing);
      return json({
        listingId, category: listing.category,
        currentRank: snap.rank,
        ...snap,
        ...quote,
        toBeatTop: quote.minBid,
        isTop: snap.isTop,
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
      const enriched = await attachRanks(db, await enrichListings(db, listings));
      const withStats = enriched.map(l => {
        const views = l.views || 0;
        const clicks = l.clicks || 0;
        const holdMs = (l.numberOneMs || 0) + (l.numberOneSince ? Math.max(0, Date.now() - new Date(l.numberOneSince).getTime()) : 0);
        return {
          ...l,
          clickRate: views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0,
          timeAtNumberOneMs: holdMs,
        };
      });
      return json({ listings: withStats });
    }

    if (path === '/me/notifications' && method === 'GET') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const items = await db.collection('notifications')
        .find({ userId: user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
      return json({ notifications: items, unread: items.filter(n => !n.read).length });
    }

    if (path === '/me/notifications/read' && method === 'POST') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const body = await request.json().catch(() => ({}));
      const q = { userId: user.id, read: false };
      if (body.id) q.id = body.id;
      await db.collection('notifications').updateMany(q, { $set: { read: true } });
      return json({ ok: true });
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
    return json({ error: err.message, code: err.code }, err.status || 500);
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
