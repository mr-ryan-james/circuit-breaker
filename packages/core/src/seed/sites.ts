import type { DatabaseSync } from "node:sqlite";
import type { SiteSeedDefinition } from "../types.js";

export const SITE_DEFINITIONS: SiteSeedDefinition[] = [
  {
    slug: "twitter",
    type: "social",
    defaultMinutes: 10,
    domains: ["twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com"],
  },
  {
    slug: "reddit",
    type: "social",
    defaultMinutes: 10,
    domains: ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "np.reddit.com"],
  },

  // News / original
  { slug: "nytimes", type: "news", defaultMinutes: 15, domains: ["nytimes.com", "www.nytimes.com"] },
  { slug: "cnn", type: "news", defaultMinutes: 15, domains: ["cnn.com", "www.cnn.com", "edition.cnn.com"] },

  // Business / Financial (treated as news)
  { slug: "bloomberg", type: "news", defaultMinutes: 15, domains: ["bloomberg.com", "www.bloomberg.com"] },
  { slug: "wsj", type: "news", defaultMinutes: 15, domains: ["wsj.com", "www.wsj.com"] },
  { slug: "cnbc", type: "news", defaultMinutes: 15, domains: ["cnbc.com", "www.cnbc.com"] },
  { slug: "ft", type: "news", defaultMinutes: 15, domains: ["ft.com", "www.ft.com"] },
  { slug: "marketwatch", type: "news", defaultMinutes: 15, domains: ["marketwatch.com", "www.marketwatch.com"] },
  {
    slug: "businessinsider",
    type: "news",
    defaultMinutes: 15,
    domains: ["businessinsider.com", "www.businessinsider.com"],
  },
  { slug: "reuters", type: "news", defaultMinutes: 15, domains: ["reuters.com", "www.reuters.com"] },

  // General news
  {
    slug: "theatlantic",
    type: "news",
    defaultMinutes: 15,
    domains: ["theatlantic.com", "www.theatlantic.com"],
  },
  {
    slug: "washingtonpost",
    type: "news",
    defaultMinutes: 15,
    domains: ["washingtonpost.com", "www.washingtonpost.com"],
  },
  {
    slug: "theguardian",
    type: "news",
    defaultMinutes: 15,
    domains: ["theguardian.com", "www.theguardian.com"],
  },
  {
    slug: "bbc",
    type: "news",
    defaultMinutes: 15,
    domains: ["bbc.com", "www.bbc.com", "bbc.co.uk", "www.bbc.co.uk"],
  },
  { slug: "npr", type: "news", defaultMinutes: 15, domains: ["npr.org", "www.npr.org"] },
  { slug: "politico", type: "news", defaultMinutes: 15, domains: ["politico.com", "www.politico.com"] },
  { slug: "axios", type: "news", defaultMinutes: 15, domains: ["axios.com", "www.axios.com"] },
  { slug: "vox", type: "news", defaultMinutes: 15, domains: ["vox.com", "www.vox.com"] },

  // Tech
  {
    slug: "techcrunch",
    type: "tech",
    defaultMinutes: 15,
    domains: ["techcrunch.com", "www.techcrunch.com"],
  },
  { slug: "theverge", type: "tech", defaultMinutes: 15, domains: ["theverge.com", "www.theverge.com"] },
  { slug: "wired", type: "tech", defaultMinutes: 15, domains: ["wired.com", "www.wired.com"] },
  {
    slug: "arstechnica",
    type: "tech",
    defaultMinutes: 15,
    domains: ["arstechnica.com", "www.arstechnica.com"],
  },
];

export const ALL_SITE_SLUGS = SITE_DEFINITIONS.map((s) => s.slug);

export function seedSites(db: DatabaseSync): void {
  const upsertSite = db.prepare(
    `INSERT INTO sites (slug, type, default_minutes)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET type=excluded.type, default_minutes=excluded.default_minutes`,
  );
  const getSiteId = db.prepare("SELECT id FROM sites WHERE slug = ? LIMIT 1");
  const insertDomain = db.prepare(
    `INSERT INTO domains (site_id, domain)
     VALUES (?, ?)
     ON CONFLICT(site_id, domain) DO NOTHING`,
  );

  for (const site of SITE_DEFINITIONS) {
    upsertSite.run(site.slug, site.type, site.defaultMinutes);
    const row = getSiteId.get(site.slug) as { id: number } | undefined;
    if (!row) continue;
    for (const domain of site.domains) {
      insertDomain.run(row.id, domain);
    }
  }
}

