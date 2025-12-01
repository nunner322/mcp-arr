/**
 * TRaSH Guides Client
 *
 * Fetches and caches quality profiles, custom formats, and naming conventions
 * from the TRaSH Guides GitHub repository.
 *
 * Data source: https://github.com/TRaSH-Guides/Guides
 */

const TRASH_BASE_URL = 'https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/docs/json';
const GITHUB_API_URL = 'https://api.github.com/repos/TRaSH-Guides/Guides/contents/docs/json';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Types
export type TrashService = 'radarr' | 'sonarr';

export interface TrashCustomFormat {
  trash_id: string;
  trash_scores?: { default: number };
  name: string;
  includeCustomFormatWhenRenaming: boolean;
  specifications: Array<{
    name: string;
    implementation: string;
    negate: boolean;
    required: boolean;
    fields: Record<string, unknown>;
  }>;
}

export interface TrashQualityProfile {
  trash_id: string;
  name: string;
  trash_description?: string;
  group?: number;
  upgradeAllowed: boolean;
  cutoff: string;
  minFormatScore: number;
  cutoffFormatScore: number;
  minUpgradeFormatScore: number;
  language: string;
  items: Array<{
    name: string;
    allowed: boolean;
    items?: string[];
  }>;
  formatItems: Record<string, string>;
}

export interface TrashQualitySize {
  trash_id: string;
  type: string;
  qualities: Array<{
    quality: string;
    min: number;
    preferred: number;
    max: number;
  }>;
}

export interface TrashNaming {
  folder: Record<string, string>;
  file: Record<string, string>;
  season?: Record<string, string>;
  series?: Record<string, string>;
  specials?: Record<string, string>;
}

export interface TrashCFGroup {
  name: string;
  trash_id: string;
  trash_description?: string;
  default?: string;
  custom_formats: Array<{
    name: string;
    trash_id: string;
    required?: boolean;
  }>;
  quality_profiles?: {
    exclude?: Record<string, string>;
    include?: Record<string, string>;
  };
}

// Cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TrashCache {
  private profiles = new Map<string, CacheEntry<TrashQualityProfile>>();
  private profileLists = new Map<string, CacheEntry<string[]>>();
  private customFormats = new Map<string, CacheEntry<TrashCustomFormat>>();
  private cfLists = new Map<string, CacheEntry<string[]>>();
  private cfGroups = new Map<string, CacheEntry<TrashCFGroup>>();
  private qualitySizes = new Map<string, CacheEntry<TrashQualitySize>>();
  private naming = new Map<string, CacheEntry<TrashNaming>>();

  isValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    return entry !== undefined && (Date.now() - entry.timestamp) < CACHE_TTL;
  }

  setProfile(key: string, data: TrashQualityProfile) {
    this.profiles.set(key, { data, timestamp: Date.now() });
  }

  getProfile(key: string): TrashQualityProfile | null {
    const entry = this.profiles.get(key);
    return this.isValid(entry) ? entry.data : null;
  }

  setProfileList(service: string, data: string[]) {
    this.profileLists.set(service, { data, timestamp: Date.now() });
  }

  getProfileList(service: string): string[] | null {
    const entry = this.profileLists.get(service);
    return this.isValid(entry) ? entry.data : null;
  }

  setCustomFormat(key: string, data: TrashCustomFormat) {
    this.customFormats.set(key, { data, timestamp: Date.now() });
  }

  getCustomFormat(key: string): TrashCustomFormat | null {
    const entry = this.customFormats.get(key);
    return this.isValid(entry) ? entry.data : null;
  }

  setCFList(service: string, data: string[]) {
    this.cfLists.set(service, { data, timestamp: Date.now() });
  }

  getCFList(service: string): string[] | null {
    const entry = this.cfLists.get(service);
    return this.isValid(entry) ? entry.data : null;
  }

  setCFGroup(key: string, data: TrashCFGroup) {
    this.cfGroups.set(key, { data, timestamp: Date.now() });
  }

  getCFGroup(key: string): TrashCFGroup | null {
    const entry = this.cfGroups.get(key);
    return this.isValid(entry) ? entry.data : null;
  }

  setQualitySize(key: string, data: TrashQualitySize) {
    this.qualitySizes.set(key, { data, timestamp: Date.now() });
  }

  getQualitySize(key: string): TrashQualitySize | null {
    const entry = this.qualitySizes.get(key);
    return this.isValid(entry) ? entry.data : null;
  }

  setNaming(key: string, data: TrashNaming) {
    this.naming.set(key, { data, timestamp: Date.now() });
  }

  getNaming(key: string): TrashNaming | null {
    const entry = this.naming.get(key);
    return this.isValid(entry) ? entry.data : null;
  }

  clear() {
    this.profiles.clear();
    this.profileLists.clear();
    this.customFormats.clear();
    this.cfLists.clear();
    this.cfGroups.clear();
    this.qualitySizes.clear();
    this.naming.clear();
  }
}

const cache = new TrashCache();

// Custom format categories
const CF_CATEGORIES: Record<string, RegExp[]> = {
  hdr: [/hdr/i, /dv/i, /dolby.*vision/i, /hdr10/i],
  audio: [/atmos/i, /dts/i, /truehd/i, /audio/i, /surround/i, /sound/i, /stereo/i, /mono/i, /aac/i, /flac/i],
  resolution: [/1080p/i, /2160p/i, /720p/i, /4k/i, /480p/i],
  source: [/bluray/i, /web/i, /remux/i, /hdtv/i, /dvd/i, /cam/i, /telesync/i],
  streaming: [/amzn/i, /nf\b/i, /netflix/i, /dsnp/i, /disney/i, /atvp/i, /apple/i, /hmax/i, /hbo/i, /hulu/i, /pcok/i, /peacock/i],
  anime: [/anime/i],
  unwanted: [/lq/i, /x265.*hdtv/i, /extras/i, /3d/i, /upscale/i, /bad.*dual/i],
  release: [/repack/i, /proper/i, /scene/i, /p2p/i],
  language: [/french/i, /german/i, /dutch/i, /multi/i, /language/i],
};

function categorizeCustomFormat(name: string): string[] {
  const categories: string[] = [];
  for (const [category, patterns] of Object.entries(CF_CATEGORIES)) {
    if (patterns.some(p => p.test(name))) {
      categories.push(category);
    }
  }
  return categories.length > 0 ? categories : ['other'];
}

// API functions
async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function listGitHubDir(path: string): Promise<string[]> {
  interface GitHubFile {
    name: string;
    type: string;
  }
  const files = await fetchJSON<GitHubFile[]>(`${GITHUB_API_URL}/${path}`);
  return files
    .filter(f => f.type === 'file' && f.name.endsWith('.json'))
    .map(f => f.name.replace('.json', ''));
}

// Public API
export class TrashClient {
  /**
   * List available quality profiles
   */
  async listProfiles(service: TrashService): Promise<{ name: string; description?: string }[]> {
    // Check cache
    const cached = cache.getProfileList(service);
    if (cached) {
      // Fetch details for each
      const profiles = await Promise.all(
        cached.map(name => this.getProfile(service, name))
      );
      return profiles.filter((p): p is TrashQualityProfile => p !== null).map(p => ({
        name: p.name,
        description: p.trash_description,
      }));
    }

    // Fetch list from GitHub
    const profileNames = await listGitHubDir(`${service}/quality-profiles`);
    cache.setProfileList(service, profileNames);

    // Fetch details
    const profiles = await Promise.all(
      profileNames.map(name => this.getProfile(service, name))
    );
    return profiles.filter((p): p is TrashQualityProfile => p !== null).map(p => ({
      name: p.name,
      description: p.trash_description,
    }));
  }

  /**
   * Get a specific quality profile
   */
  async getProfile(service: TrashService, profileName: string): Promise<TrashQualityProfile | null> {
    const key = `${service}/${profileName}`;
    const cached = cache.getProfile(key);
    if (cached) return cached;

    try {
      const profile = await fetchJSON<TrashQualityProfile>(
        `${TRASH_BASE_URL}/${service}/quality-profiles/${profileName}.json`
      );
      cache.setProfile(key, profile);
      return profile;
    } catch {
      return null;
    }
  }

  /**
   * List available custom formats
   */
  async listCustomFormats(service: TrashService, category?: string): Promise<{ name: string; categories: string[]; defaultScore?: number }[]> {
    // Check cache
    let cfNames = cache.getCFList(service);
    if (!cfNames) {
      cfNames = await listGitHubDir(`${service}/cf`);
      cache.setCFList(service, cfNames);
    }

    // Fetch details for categorization
    const formats: { name: string; categories: string[]; defaultScore?: number }[] = [];

    // Batch fetch - limit to prevent rate limiting
    const batchSize = 20;
    for (let i = 0; i < cfNames.length; i += batchSize) {
      const batch = cfNames.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async name => {
          const cf = await this.getCustomFormat(service, name);
          if (!cf) return null;
          const cats = categorizeCustomFormat(cf.name);
          return {
            name: cf.name,
            categories: cats,
            defaultScore: cf.trash_scores?.default,
          };
        })
      );
      formats.push(...results.filter((f): f is NonNullable<typeof f> => f !== null));
    }

    // Filter by category if specified
    if (category) {
      return formats.filter(f => f.categories.includes(category.toLowerCase()));
    }

    return formats;
  }

  /**
   * Get a specific custom format
   */
  async getCustomFormat(service: TrashService, cfName: string): Promise<TrashCustomFormat | null> {
    const key = `${service}/${cfName}`;
    const cached = cache.getCustomFormat(key);
    if (cached) return cached;

    try {
      const cf = await fetchJSON<TrashCustomFormat>(
        `${TRASH_BASE_URL}/${service}/cf/${cfName}.json`
      );
      cache.setCustomFormat(key, cf);
      return cf;
    } catch {
      return null;
    }
  }

  /**
   * Get naming conventions
   */
  async getNaming(service: TrashService): Promise<TrashNaming | null> {
    const cached = cache.getNaming(service);
    if (cached) return cached;

    try {
      const naming = await fetchJSON<TrashNaming>(
        `${TRASH_BASE_URL}/${service}/naming/${service}-naming.json`
      );
      cache.setNaming(service, naming);
      return naming;
    } catch {
      return null;
    }
  }

  /**
   * Get quality size recommendations
   */
  async getQualitySizes(service: TrashService, type?: string): Promise<TrashQualitySize[]> {
    const sizeTypes = service === 'radarr'
      ? ['movie', 'anime']
      : ['series', 'anime'];

    const sizes: TrashQualitySize[] = [];

    for (const sizeType of sizeTypes) {
      const key = `${service}/${sizeType}`;
      let size = cache.getQualitySize(key);

      if (!size) {
        try {
          size = await fetchJSON<TrashQualitySize>(
            `${TRASH_BASE_URL}/${service}/quality-size/${sizeType}.json`
          );
          cache.setQualitySize(key, size);
        } catch {
          continue;
        }
      }

      if (!type || size.type === type) {
        sizes.push(size);
      }
    }

    return sizes;
  }

  /**
   * Get custom format groups
   */
  async listCFGroups(service: TrashService): Promise<string[]> {
    return listGitHubDir(`${service}/cf-groups`);
  }

  /**
   * Get a specific CF group
   */
  async getCFGroup(service: TrashService, groupName: string): Promise<TrashCFGroup | null> {
    const key = `${service}/${groupName}`;
    const cached = cache.getCFGroup(key);
    if (cached) return cached;

    try {
      const group = await fetchJSON<TrashCFGroup>(
        `${TRASH_BASE_URL}/${service}/cf-groups/${groupName}.json`
      );
      cache.setCFGroup(key, group);
      return group;
    } catch {
      return null;
    }
  }

  /**
   * Clear the cache (force refresh)
   */
  clearCache() {
    cache.clear();
  }
}

// Singleton instance
export const trashClient = new TrashClient();
