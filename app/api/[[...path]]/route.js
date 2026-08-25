import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { CURRENCIES, COUNTRY_CURRENCY, BASE_CURRENCY, currencyOf, toBase } from '@/lib/money';
import { createRazorpayOrder, razorpayConfigured, razorpayPublicKey, verifyRazorpaySignature } from '@/lib/razorpay';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'donate_colab';

const MIN_INCREMENT = 1;                   // no minimum pay — ₹1 is enough to enter or overtake
const PLATFORM_FEE_PCT = 0;                // no platform fee — pay only the bid
const COMPETITION_PERIOD_MS = 24 * 60 * 60 * 1000; // unused: ranking never expires
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

const mongoOptions = {
  maxPoolSize: 5,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

function isTopologyClosed(err) {
  const msg = String(err?.message || err?.code || err?.name || '');
  return /topology is closed/i.test(msg) || err?.name === 'MongoTopologyClosedError';
}

function resetMongo() {
  const g = globalThis;
  const stale = g.__mongoClient;
  g.__mongoClient = null;
  g.__mongoConnect = null;
  if (stale) stale.close().catch(() => {});
}

async function connectMongo() {
  const g = globalThis;
  if (!g.__mongoConnect) {
    g.__mongoConnect = new MongoClient(MONGO_URL, mongoOptions).connect()
      .then((connected) => {
        g.__mongoClient = connected;
        connected.on('close', () => {
          if (g.__mongoClient === connected) resetMongo();
        });
        return connected;
      })
      .catch((err) => {
        resetMongo();
        throw err;
      });
  }
  return g.__mongoConnect;
}

async function getDb() {
  if (!MONGO_URL) {
    const err = new Error('Database is not configured');
    err.status = 503;
    throw err;
  }
  let client;
  try {
    client = await connectMongo();
    await client.db('admin').command({ ping: 1 });
  } catch {
    resetMongo();
    client = await connectMongo();
    await client.db('admin').command({ ping: 1 });
  }
  return client.db(DB_NAME);
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
  console.log('publicOrigin', process.env.NEXT_PUBLIC_BASE_URL, url.origin);
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
    platformFee: 0,
    platformFeePct: 0,
    totalCharge: minBid,
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
      score: raised,
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


/* ------------------------- crediting a payment ------------------------- */
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
      kind: (kind === 'FAN' || kind === 'DONATION' || kind === 'FAN_BOOST') ? 'FAN' : (kind || 'SELF_PAY'),
      backerName: backerName || user?.name || (kind === 'FAN' ? 'Fan' : fresh.name),
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

    const isFan = contribution.kind === 'FAN';
    const inc = { totalRaised: amount, backers: 1, ...(isFan ? { donated: amount } : { selfPaid: amount }) };
    await db.collection('listings').updateOne({ id: fresh.id }, {
      $inc: inc,
      $set: { lastPaidAt: now },
    });

    const eventType = isFan ? 'FAN' : ((beforeMap[fresh.id]?.rank === 1) ? 'DEFENDED' : 'TOOK_RANK');
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
      selfPaid: updated?.selfPaid || (isFan ? 0 : amount),
      donated: updated?.donated || (isFan ? amount : 0),
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
    return { seeded: false };
  })();
  return seedPromise;
}

function json(data, status = 200) { return NextResponse.json(data, { status }); }

function resolvePayKind(listing, user, requested) {
  const owner = !!(listing?.ownerId && user?.id && listing.ownerId === user.id);
  if (owner) return 'SELF_PAY';
  const fan = requested === 'FAN' || requested === 'DONATION' || requested === 'FAN_BOOST';
  return fan || !owner ? 'FAN' : 'SELF_PAY';
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

  try {
    // Start Google login without Mongo — a closed Atlas client was blocking the redirect.
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

    const db = await getDb();
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
          chips: c.chips, zeroDecimal: !!c.zeroDecimal,
        })),
      });
    }

    if (path === '/plans' && method === 'GET') {
      return json({ plans: Object.values(PLANS), split: SPLIT, creatorSharePct: CREATOR_SHARE * 100 });
    }

    if (path === '/stats' && method === 'GET') {
      const t = await totals(db);
      const totalListings = await db.collection('listings').countDocuments({ status: { $ne: 'REJECTED' } });
      return json({
        ...t,
        totalListings,
        activeProfiles: totalListings,
        viewersOnline: 30 + Math.floor(Math.random() * 80),
        listingQuota: await listingQuota(db),
        minIncrement: MIN_INCREMENT,
        platformFeePct: PLATFORM_FEE_PCT * 100,
        battle: null,
      });
    }

    if (path === '/listings/quota' && method === 'GET') {
      return json(await listingQuota(db));
    }

    if (path === '/search' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim();
      const category = url.searchParams.get('category') || 'all';
      if (!q) return json({ listings: [], q: '' });
      const ranked = await rankedCategory(db, category);
      const needle = q.replace(/^@/, '').toLowerCase();
      const listings = ranked.filter(l => {
        const hay = [l.name, l.handle, l.displayName, l.tagline, l.website].join(' ').toLowerCase();
        return hay.includes(needle);
      });
      return json({ listings, q });
    }

    if (path === '/rankings' && method === 'GET') {
      const category = url.searchParams.get('category') || 'all';
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const ranked = await rankedCategory(db, category);
      return json({
        rankings: ranked.slice(0, limit),
        minIncrement: MIN_INCREMENT,
        battle: null,
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
          error: 'Free listing slots are full. Pay to list your profile and start ranking.',
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

    /* ---------- Razorpay Standard Checkout ---------- */
    if (path === '/create-order' && method === 'POST') {
      if (!razorpayConfigured()) return json({ error: 'Razorpay is not configured' }, 500);
      const body = await request.json();
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Log in to compete for a rank.' }, 401);

      const listingId = body.listingId || null;
      const cur = currencyOf(body.currency || BASE_CURRENCY);
      const targetRank = Math.max(1, Math.min(5, Number(body.targetRank) || 1));
      let amountPaise;
      let amountInr;
      let localAmount;
      let listing = null;
      let kind = 'SELF_PAY';

      if (listingId) {
        localAmount = Math.floor(Number(body.amount));
        if (!Number.isFinite(localAmount) || localAmount < 1) {
          return json({ error: `Minimum amount is ${cur.symbol}1` }, 400);
        }
        amountInr = cur.code === BASE_CURRENCY ? localAmount : toBase(localAmount, cur.code);
        amountPaise = amountInr * 100;
        listing = await db.collection('listings').findOne({ id: listingId });
        if (!listing) return json({ error: 'listing not found' }, 404);
        kind = resolvePayKind(listing, user, body.kind);
        const quote = await quoteChallenge(db, { category: listing.category, listingId: listing.id, targetRank });
        if (amountInr < quote.minBid) {
          return json({
            error: `Too late — #${targetRank} now costs more. Minimum is ₹${quote.minBid}.`,
            code: 'AMOUNT_STALE',
            quote,
          }, 409);
        }
      } else {
        amountPaise = Math.floor(Number(body.amountPaise ?? body.amount));
        amountInr = Math.round(amountPaise / 100);
        localAmount = amountInr;
      }

      if (!Number.isFinite(amountPaise) || amountPaise < 100) {
        return json({ error: 'Minimum amount is 100 paise' }, 400);
      }

      const paymentId = uuidv4();
      let order;
      try {
        order = await createRazorpayOrder({
          amount: amountPaise,
          currency: 'INR',
          receipt: body.receipt || paymentId.replace(/-/g, '').slice(0, 40),
          notes: {
            paymentId,
            listingId: listingId || '',
            userId: user.id,
            kind,
            targetRank: String(targetRank),
          },
        });
      } catch (e) {
        const status = e.status === 401 ? 401 : (e.status === 400 ? 400 : 500);
        return json({ error: e.message || 'Could not create Razorpay order' }, status);
      }

      await db.collection('payments').insertOne({
        id: paymentId,
        listingId: listingId || null,
        listingName: listing?.name || '',
        userId: user.id,
        provider: 'RAZORPAY',
        orderId: order.id,
        amount: amountInr,
        amountPaise,
        fee: platformFeeOn(amountInr),
        localAmount,
        localCurrency: cur.code,
        currency: 'INR',
        kind,
        targetRank,
        plan: body.plan || '',
        message: String(body.message || '').slice(0, 200),
        backerName: body.backerName || user.name || '',
        status: 'PENDING',
        creditedAt: null,
        createdAt: new Date(),
      });

      return json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: razorpayPublicKey(),
      });
    }

    if (path === '/verify-payment' && method === 'POST') {
      const body = await request.json();
      const razorpay_order_id = body.razorpay_order_id;
      const razorpay_payment_id = body.razorpay_payment_id;
      const razorpay_signature = body.razorpay_signature;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' }, 400);
      }
      if (!verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature })) {
        return json({ error: 'Signature mismatch', success: false }, 400);
      }

      const record = await db.collection('payments').findOne({ orderId: razorpay_order_id, provider: 'RAZORPAY' });
      if (!record) {
        return json({ success: true, verified: true, order_id: razorpay_order_id, payment_id: razorpay_payment_id });
      }
      if (record.creditedAt) {
        return json({
          success: true, verified: true, credited: false, duplicate: true,
          newRank: record.newRank || null, amount: record.amount,
          listingId: record.listingId, listingName: record.listingName, kind: record.kind,
        });
      }

      const claim = await db.collection('payments').findOneAndUpdate(
        { orderId: razorpay_order_id, creditedAt: null },
        {
          $set: {
            creditedAt: new Date(),
            status: 'SUCCESS',
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
          },
        },
        { returnDocument: 'after' }
      );
      const claimed = claim?.value || claim;
      if (!claimed || !claimed.creditedAt) {
        return json({ success: true, verified: true, credited: false, duplicate: true });
      }

      if (!record.listingId) {
        return json({ success: true, verified: true, credited: false, order_id: razorpay_order_id, payment_id: razorpay_payment_id });
      }

      const listing = await db.collection('listings').findOne({ id: record.listingId });
      if (!listing) return json({ error: 'listing not found' }, 404);
      const user = record.userId ? await db.collection('users').findOne({ id: record.userId }) : null;

      const res = await applyContribution(db, {
        listing,
        amount: record.amount,
        kind: record.kind || 'SELF_PAY',
        user,
        backerName: record.backerName,
        message: record.message,
        plan: record.plan,
        provider: 'RAZORPAY',
        providerRef: razorpay_payment_id,
        paymentId: record.id,
        targetRank: record.targetRank || 1,
      });

      await db.collection('payments').updateOne({ orderId: razorpay_order_id }, { $set: { newRank: res.newRank } });

      return json({
        success: true, verified: true, credited: true, mode: 'RAZORPAY',
        listingId: listing.id, listingName: listing.name, listingLogo: listing.logo,
        listingImage: listing.image || '', category: listing.category,
        kind: record.kind, amount: record.amount, baseAmount: record.amount, ...res,
      });
    }

    /* ---------- pay to take / defend a rank ---------- */
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
      const kind = resolvePayKind(listing, user, body.kind);
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
        status: 'SUCCESS', kind, targetRank, createdAt: new Date(),
      };
      await db.collection('payments').insertOne(payment);

      const res = await applyContribution(db, {
        listing, amount, kind, user,
        backerName: body.backerName || user.name, plan: body.plan,
        provider: 'MOCK', paymentId: payment.id, targetRank,
      });

      return json({
        ok: true, mode: 'MOCK', ...res, category: listing.category, kind, payment,
        localAmount, localCurrency: cur.code, baseAmount: amount,
        platformFee: platformFeeOn(amount),
        totalCharge: amount + platformFeeOn(amount),
      });
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
    if (isTopologyClosed(err) && !context._mongoRetry) {
      context._mongoRetry = true;
      resetMongo();
      return handler(request, context);
    }
    console.error('API error:', err);
    return json({ error: err.message, code: err.code }, err.status || 500);
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
