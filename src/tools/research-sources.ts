/**
 * research_sources: source-specific discovery for current research/code/data.
 *
 * Complements generic web_search with structured public endpoints for:
 * - arXiv Atom API for recent papers
 * - GitHub Search API for repositories, issues/PRs, and code
 * - Hugging Face Hub API for papers/models/datasets
 * - Kaggle APIs for datasets and competitions
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Tool, ToolResult } from './types.js';

type ResearchSource = 'all' | 'arxiv' | 'github' | 'huggingface' | 'kaggle';
type GitHubKind = 'repositories' | 'issues' | 'pulls' | 'code' | 'all';
type HuggingFaceKind = 'models' | 'datasets' | 'papers' | 'both' | 'all';
type KaggleKind = 'datasets' | 'competitions' | 'both';

const USER_AGENT = 'ventipus/1.x (+https://github.com/Crownelius/ventipus)';

interface SourceHit {
  source: string;
  title: string;
  url: string;
  meta?: string;
  summary?: string;
}

interface SourceSearchResult {
  source: ResearchSource;
  hits: SourceHit[];
  error?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string | undefined, max = 260): string | undefined {
  if (!s) return undefined;
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 3) + '...' : clean;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readTextFileIfPresent(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    if (!existsSync(path)) return undefined;
    const text = readFileSync(path, 'utf-8').trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function resolveHomePath(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return resolve(path);
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
}

function fetchLimitForRecent(limit: number, recentDays?: number): number {
  if (!recentDays || recentDays <= 0) return limit;
  return Math.min(100, Math.max(limit * 5, limit));
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function dateWithinRecentDays(value: string | null | undefined, recentDays?: number): boolean {
  if (!recentDays || recentDays <= 0) return true;
  const ms = parseDateMs(value);
  if (ms == null) return true;
  return ms >= Date.now() - recentDays * MS_PER_DAY;
}

function arxivDateRange(days: number): string {
  const start = isoDaysAgo(days).replace(/-/g, '') + '0000';
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '2359';
  return `submittedDate:[${start}+TO+${end}]`;
}

function buildArxivQuery(query: string, recentDays?: number): string {
  const raw = query.trim();
  const hasField = /\b(?:all|ti|au|abs|cat|id|doi|jr):/i.test(raw);
  const terms = hasField
    ? raw
    : raw.split(/\s+/).filter(Boolean).map((t) => `all:${t}`).join('+AND+');
  if (recentDays && recentDays > 0) return `${terms}+AND+${arxivDateRange(recentDays)}`;
  return terms;
}

function parseTag(entry: string, tag: string): string {
  const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

function parseArxivFeed(xml: string, limit: number): SourceHit[] {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit);
  return entries.map((m) => {
    const entry = m[1];
    const id = parseTag(entry, 'id');
    const title = parseTag(entry, 'title');
    const summary = parseTag(entry, 'summary');
    const published = parseTag(entry, 'published').slice(0, 10);
    const category = entry.match(/<category[^>]*term="([^"]+)"/i)?.[1];
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map((a) => decodeEntities(a[1]))
      .slice(0, 3);
    return {
      source: 'arXiv',
      title,
      url: id || 'https://arxiv.org',
      meta: [published, category, authors.length ? authors.join(', ') : undefined].filter(Boolean).join(' | '),
      summary: truncate(summary),
    };
  }).filter((h) => h.title && h.url);
}

async function searchArxiv(query: string, limit: number, recentDays?: number): Promise<SourceHit[]> {
  const params = new URLSearchParams({
    search_query: buildArxivQuery(query, recentDays),
    start: '0',
    max_results: String(limit),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
  const resp = await fetch(`https://export.arxiv.org/api/query?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`arXiv HTTP ${resp.status}`);
  return parseArxivFeed(await resp.text(), limit);
}

interface GitHubRepo {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  pushed_at?: string;
  topics?: string[];
}

interface GitHubIssue {
  html_url?: string;
  title?: string;
  body?: string | null;
  number?: number;
  state?: string;
  comments?: number;
  created_at?: string;
  updated_at?: string;
  pull_request?: { html_url?: string };
  labels?: Array<{ name?: string }>;
  user?: { login?: string };
  repository_url?: string;
  repository?: { full_name?: string; html_url?: string };
}

interface GitHubCodeResult {
  name?: string;
  path?: string;
  html_url?: string;
  repository?: { full_name?: string; html_url?: string; language?: string | null };
  score?: number;
}

function parseGitHubRepos(json: unknown, limit: number): SourceHit[] {
  const items = (json as { items?: GitHubRepo[] }).items ?? [];
  return items.slice(0, limit).map((r) => ({
    source: 'GitHub',
    title: r.full_name ?? '(unknown repository)',
    url: r.html_url ?? 'https://github.com',
    meta: [
      r.language ?? undefined,
      typeof r.stargazers_count === 'number' ? `${r.stargazers_count.toLocaleString()} stars` : undefined,
      typeof r.forks_count === 'number' ? `${r.forks_count.toLocaleString()} forks` : undefined,
      r.pushed_at ? `pushed ${r.pushed_at.slice(0, 10)}` : undefined,
      r.topics?.slice(0, 4).join(', '),
    ].filter(Boolean).join(' | '),
    summary: truncate(r.description ?? undefined),
  })).filter((h) => h.title && h.url);
}

function parseGitHubIssues(json: unknown, limit: number, kind: 'issue' | 'pull'): SourceHit[] {
  const items = (json as { items?: GitHubIssue[] }).items ?? [];
  return items.slice(0, limit).map((issue) => {
    const repo = issue.repository?.full_name ?? repoNameFromApiUrl(issue.repository_url);
    const labelNames = issue.labels?.map((label) => label.name).filter(Boolean).slice(0, 4) ?? [];
    return {
      source: kind === 'pull' ? 'GitHub pull' : 'GitHub issue',
      title: [repo, issue.number ? `#${issue.number}` : undefined, issue.title].filter(Boolean).join(' '),
      url: issue.html_url ?? issue.pull_request?.html_url ?? 'https://github.com',
      meta: [
        issue.state ?? undefined,
        typeof issue.comments === 'number' ? `${issue.comments.toLocaleString()} comments` : undefined,
        issue.updated_at ? `updated ${issue.updated_at.slice(0, 10)}` : undefined,
        issue.created_at ? `created ${issue.created_at.slice(0, 10)}` : undefined,
        issue.user?.login ? `by ${issue.user.login}` : undefined,
        labelNames.join(', '),
      ].filter(Boolean).join(' | '),
      summary: truncate(issue.body ?? undefined),
    };
  }).filter((h) => h.title && h.url);
}

function parseGitHubCode(json: unknown, limit: number): SourceHit[] {
  const items = (json as { items?: GitHubCodeResult[] }).items ?? [];
  return items.slice(0, limit).map((item) => {
    const repo = item.repository?.full_name;
    const path = item.path ?? item.name ?? '';
    return {
      source: 'GitHub code',
      title: [repo, path].filter(Boolean).join(':'),
      url: item.html_url ?? item.repository?.html_url ?? 'https://github.com',
      meta: [
        item.repository?.language ?? undefined,
        typeof item.score === 'number' ? `score ${item.score.toFixed(2)}` : undefined,
      ].filter(Boolean).join(' | '),
      summary: repo ? `Repository: ${repo}` : undefined,
    };
  }).filter((h) => h.title && h.url);
}

function repoNameFromApiUrl(url: string | undefined): string | undefined {
  const match = url?.match(/\/repos\/([^/]+\/[^/]+)$/);
  return match?.[1];
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = firstNonEmpty(process.env.GITHUB_TOKEN, process.env.GH_TOKEN, process.env.GITHUB_API_TOKEN);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function searchGitHub(query: string, limit: number, recentDays: number | undefined, kind: GitHubKind): Promise<SourceHit[]> {
  const calls: Promise<SourceHit[]>[] = [];
  if (kind === 'repositories' || kind === 'all') calls.push(searchGitHubRepos(query, limit, recentDays));
  if (kind === 'issues' || kind === 'all') calls.push(searchGitHubIssues(query, limit, recentDays, 'issue'));
  if (kind === 'pulls' || kind === 'all') calls.push(searchGitHubIssues(query, limit, recentDays, 'pull'));
  if (kind === 'code' || kind === 'all') calls.push(searchGitHubCode(query, limit));

  const settled = await Promise.allSettled(calls);
  const hits = settled
    .filter((result): result is PromiseFulfilledResult<SourceHit[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  if (hits.length > 0) return hits.slice(0, limit * (kind === 'all' ? 4 : 1));

  const error = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (error) throw error.reason;
  return [];
}

async function searchGitHubRepos(query: string, limit: number, recentDays?: number): Promise<SourceHit[]> {
  const q = recentDays && recentDays > 0
    ? `${query} pushed:>=${isoDaysAgo(recentDays)}`
    : query;
  const params = new URLSearchParams({
    q,
    sort: recentDays ? 'updated' : 'stars',
    order: 'desc',
    per_page: String(limit),
  });
  const resp = await fetch(`https://api.github.com/search/repositories?${params}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`GitHub repositories HTTP ${resp.status}`);
  return parseGitHubRepos(await resp.json(), limit);
}

async function searchGitHubIssues(
  query: string,
  limit: number,
  recentDays: number | undefined,
  kind: 'issue' | 'pull',
): Promise<SourceHit[]> {
  const qualifier = kind === 'pull' ? 'is:pull-request' : 'is:issue';
  const parts = [query];
  if (!/\bis:(issue|pr|pull-request)\b/i.test(query)) parts.push(qualifier);
  if (recentDays && recentDays > 0 && !/\b(updated|created):/i.test(query)) {
    parts.push(`updated:>=${isoDaysAgo(recentDays)}`);
  }
  const params = new URLSearchParams({
    q: parts.join(' '),
    sort: recentDays ? 'updated' : 'interactions',
    order: 'desc',
    per_page: String(limit),
  });
  const resp = await fetch(`https://api.github.com/search/issues?${params}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`GitHub ${kind === 'pull' ? 'pulls' : 'issues'} HTTP ${resp.status}`);
  return parseGitHubIssues(await resp.json(), limit, kind);
}

async function searchGitHubCode(query: string, limit: number): Promise<SourceHit[]> {
  const params = new URLSearchParams({
    q: query,
    per_page: String(limit),
  });
  const resp = await fetch(`https://api.github.com/search/code?${params}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`GitHub code HTTP ${resp.status}`);
  return parseGitHubCode(await resp.json(), limit);
}

interface HuggingFaceRepo {
  id?: string;
  modelId?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  createdAt?: string;
  tags?: string[];
  pipeline_tag?: string;
}

interface HuggingFacePaperAuthor {
  name?: string;
  hidden?: boolean;
}

interface HuggingFacePaper {
  id?: string;
  title?: string;
  summary?: string;
  ai_summary?: string;
  ai_keywords?: string[];
  authors?: HuggingFacePaperAuthor[];
  publishedAt?: string;
  submittedOnDailyAt?: string;
  upvotes?: number;
  githubRepo?: string;
  projectPage?: string;
}

interface HuggingFaceDailyPaper {
  paper?: HuggingFacePaper;
  title?: string;
  summary?: string;
  publishedAt?: string;
  numComments?: number;
}

function parseHuggingFaceRepos(json: unknown, sourceLabel: string, limit: number, recentDays?: number): SourceHit[] {
  const items = Array.isArray(json) ? json as HuggingFaceRepo[] : [];
  const kindPath = sourceLabel === 'HF dataset' ? 'datasets' : '';
  return items
    .filter((r) => dateWithinRecentDays(r.lastModified ?? r.createdAt, recentDays))
    .slice(0, limit)
    .map((r) => {
      const id = r.id ?? r.modelId ?? '';
      return {
        source: sourceLabel,
        title: id,
        url: id ? `https://huggingface.co/${kindPath ? `${kindPath}/` : ''}${id}` : 'https://huggingface.co',
        meta: [
          r.pipeline_tag,
          typeof r.downloads === 'number' ? `${r.downloads.toLocaleString()} downloads` : undefined,
          typeof r.likes === 'number' ? `${r.likes.toLocaleString()} likes` : undefined,
          r.lastModified ? `updated ${r.lastModified.slice(0, 10)}` : undefined,
          !r.lastModified && r.createdAt ? `created ${r.createdAt.slice(0, 10)}` : undefined,
          r.tags?.slice(0, 4).join(', '),
        ].filter(Boolean).join(' | '),
      };
    })
    .filter((h) => h.title && h.url);
}

function parseHuggingFacePapers(json: unknown, query: string, limit: number): SourceHit[] {
  const items = Array.isArray(json) ? json as HuggingFaceDailyPaper[] : [];
  const queryTerms = tokenizeQuery(query);
  return items
    .map((item) => {
      const paper = normalizeHuggingFacePaper(item);
      const title = paper.title ?? '';
      const summary = paper.ai_summary || paper.summary || '';
      const authors = paper.authors
        ?.filter((author: HuggingFacePaperAuthor) => !author.hidden && author.name)
        .map((author: HuggingFacePaperAuthor) => author.name as string)
        .slice(0, 3) ?? [];
      const haystack = [
        paper.id,
        title,
        summary,
        paper.ai_keywords?.join(' '),
        authors.join(' '),
        paper.githubRepo,
        paper.projectPage,
      ].filter(Boolean).join(' ').toLowerCase();
      const score = scoreTerms(queryTerms, haystack);
      return { item, paper, title, summary, authors, score };
    })
    .filter((entry) => entry.title && (queryTerms.length === 0 || entry.score > 0))
    .sort((a, b) => b.score - a.score || Number(b.paper.upvotes ?? 0) - Number(a.paper.upvotes ?? 0))
    .slice(0, limit)
    .map((entry) => {
      const paper = entry.paper;
      const id = paper.id;
      return {
        source: 'HF paper',
        title: entry.title,
        url: id ? `https://huggingface.co/papers/${id}` : 'https://huggingface.co/papers',
        meta: [
          paper.publishedAt ? `published ${paper.publishedAt.slice(0, 10)}` : undefined,
          paper.submittedOnDailyAt ? `daily ${paper.submittedOnDailyAt.slice(0, 10)}` : undefined,
          typeof paper.upvotes === 'number' ? `${paper.upvotes.toLocaleString()} upvotes` : undefined,
          entry.authors.length ? entry.authors.join(', ') : undefined,
          paper.githubRepo ? `code ${paper.githubRepo}` : undefined,
        ].filter(Boolean).join(' | '),
        summary: truncate(entry.summary),
      };
    });
}

function normalizeHuggingFacePaper(item: HuggingFaceDailyPaper): HuggingFacePaper {
  const paper = item.paper ?? {};
  return {
    ...paper,
    title: paper.title ?? item.title,
    summary: paper.summary ?? item.summary,
    publishedAt: paper.publishedAt ?? item.publishedAt,
  };
}

function tokenizeQuery(query: string): string[] {
  return Array.from(new Set(
    query.toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  )).slice(0, 12);
}

function scoreTerms(terms: string[], haystack: string): number {
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score++;
  }
  return score;
}

async function searchHuggingFace(query: string, limit: number, kind: HuggingFaceKind, recentDays?: number): Promise<SourceHit[]> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  const token = resolveHuggingFaceToken(process.env);
  if (token) headers.Authorization = `Bearer ${token}`;
  const repoLimit = fetchLimitForRecent(limit, recentDays);
  const shared = {
    search: query,
    sort: recentDays ? 'lastModified' : 'downloads',
    direction: '-1',
    limit: String(repoLimit),
    ...(recentDays ? { full: 'true' } : {}),
  };
  const calls: Promise<SourceHit[]>[] = [];
  if (kind === 'models' || kind === 'both' || kind === 'all') {
    const params = new URLSearchParams(shared);
    calls.push(fetch(`https://huggingface.co/api/models?${params}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Hugging Face models HTTP ${r.status}`);
      return parseHuggingFaceRepos(await r.json(), 'HF model', limit, recentDays);
    }));
  }
  if (kind === 'datasets' || kind === 'both' || kind === 'all') {
    const params = new URLSearchParams(shared);
    calls.push(fetch(`https://huggingface.co/api/datasets?${params}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Hugging Face datasets HTTP ${r.status}`);
      return parseHuggingFaceRepos(await r.json(), 'HF dataset', limit, recentDays);
    }));
  }
  if (kind === 'papers' || kind === 'all') {
    calls.push(searchHuggingFacePapers(query, limit, recentDays, headers));
  }
  const results = await Promise.all(calls);
  const multiplier = kind === 'all' ? 3 : kind === 'both' ? 2 : 1;
  return results.flat().slice(0, limit * multiplier);
}

async function searchHuggingFacePapers(
  query: string,
  limit: number,
  recentDays: number | undefined,
  headers: Record<string, string>,
): Promise<SourceHit[]> {
  const days = recentDays && recentDays > 1
    ? Math.min(30, Math.floor(recentDays))
    : 1;
  const dates: Array<string | undefined> = Array.from({ length: days }, (_, index) =>
    recentDays && recentDays > 1 ? isoDaysAgo(index) : undefined,
  );
  const responses = await Promise.all(dates.map(async (date) => {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    const resp = await fetch(`https://huggingface.co/api/daily_papers${params}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) throw new Error(`Hugging Face papers HTTP ${resp.status}`);
    return await resp.json();
  }));
  const combined = responses.flatMap((json) => Array.isArray(json) ? json : []);
  const seen = new Set<string>();
  const deduped = combined.filter((item) => {
    const paper = (item as HuggingFaceDailyPaper).paper ?? item as HuggingFacePaper;
    const key = paper.id || paper.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return parseHuggingFacePapers(deduped, query, limit);
}

function resolveHuggingFaceToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = firstNonEmpty(
    env.HF_TOKEN,
    env.HUGGING_FACE_HUB_TOKEN,
    env.HUGGINGFACE_TOKEN,
    env.HUGGINGFACE_API_KEY,
    env.HF_API_KEY,
  );
  if (explicit) return explicit;

  const explicitPath = firstNonEmpty(env.HF_TOKEN_PATH);
  const pathToken = readTextFileIfPresent(explicitPath ? resolveHomePath(explicitPath) : undefined);
  if (pathToken) return pathToken;

  const hfHome = firstNonEmpty(env.HF_HOME)
    ? resolveHomePath(firstNonEmpty(env.HF_HOME)!)
    : join(homedir(), '.cache', 'huggingface');
  return readTextFileIfPresent(join(hfHome, 'token'))
    || readTextFileIfPresent(join(homedir(), '.huggingface', 'token'));
}

interface KaggleDataset {
  title?: string;
  titleNullable?: string;
  url?: string;
  urlNullable?: string;
  creatorNameNullable?: string;
  ownerNameNullable?: string;
  downloadCountNullable?: number;
  voteCountNullable?: number;
  usabilityRatingNullable?: number;
  lastUpdated?: string;
  lastUpdatedNullable?: string;
  licenseNameNullable?: string;
  subtitleNullable?: string;
}

interface KaggleCompetition {
  ref?: string;
  title?: string;
  url?: string;
  description?: string | null;
  subtitle?: string | null;
  category?: string | null;
  reward?: string | null;
  prize?: string | null;
  deadline?: string | null;
  enabledDate?: string | null;
  teamCount?: number;
  userRank?: number | null;
  organizationName?: string | null;
  evaluationMetric?: string | null;
  tags?: Array<string | { name?: string; fullPath?: string }>;
  tagNames?: string[];
}

function normalizeKaggleUrl(raw: string | undefined): string {
  if (!raw) return 'https://www.kaggle.com/datasets';
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `https://www.kaggle.com${path}`;
}

function normalizeKaggleCompetitionUrl(raw: string | undefined, ref: string | undefined): string {
  if (raw) return normalizeKaggleUrl(raw);
  if (ref) return `https://www.kaggle.com/competitions/${ref}`;
  return 'https://www.kaggle.com/competitions';
}

function parseKaggleDatasets(json: unknown, limit: number, recentDays?: number): SourceHit[] {
  const items = Array.isArray(json) ? json as KaggleDataset[] : [];
  return items
    .filter((d) => dateWithinRecentDays(d.lastUpdatedNullable ?? d.lastUpdated, recentDays))
    .slice(0, limit)
    .map((d) => ({
      source: 'Kaggle',
      title: d.titleNullable ?? d.title ?? '(unknown dataset)',
      url: normalizeKaggleUrl(d.urlNullable ?? d.url),
      meta: [
        d.ownerNameNullable || d.creatorNameNullable,
        typeof d.downloadCountNullable === 'number' ? `${d.downloadCountNullable.toLocaleString()} downloads` : undefined,
        typeof d.voteCountNullable === 'number' ? `${d.voteCountNullable.toLocaleString()} votes` : undefined,
        typeof d.usabilityRatingNullable === 'number' ? `usability ${d.usabilityRatingNullable.toFixed(1)}` : undefined,
        d.licenseNameNullable,
        d.lastUpdatedNullable || d.lastUpdated ? `updated ${(d.lastUpdatedNullable ?? d.lastUpdated ?? '').slice(0, 10)}` : undefined,
      ].filter(Boolean).join(' | '),
      summary: truncate(d.subtitleNullable),
    }))
    .filter((h) => h.title && h.url);
}

function parseKaggleCompetitions(json: unknown, limit: number, recentDays?: number): SourceHit[] {
  const items = Array.isArray(json)
    ? json as KaggleCompetition[]
    : ((json as { competitions?: KaggleCompetition[]; items?: KaggleCompetition[] }).competitions
      ?? (json as { competitions?: KaggleCompetition[]; items?: KaggleCompetition[] }).items
      ?? []);
  return items
    .filter((c) => dateWithinRecentDays(c.enabledDate, recentDays))
    .slice(0, limit)
    .map((c) => {
      const tags = [
        ...(c.tagNames ?? []),
        ...(c.tags ?? []).map((tag) => typeof tag === 'string' ? tag : (tag.name ?? tag.fullPath ?? '')),
      ].filter(Boolean).slice(0, 4);
      return {
        source: 'Kaggle competition',
        title: c.title ?? c.ref ?? '(unknown competition)',
        url: normalizeKaggleCompetitionUrl(c.url, c.ref),
        meta: [
          c.category ?? undefined,
          c.reward ?? c.prize ?? undefined,
          typeof c.teamCount === 'number' ? `${c.teamCount.toLocaleString()} teams` : undefined,
          c.deadline ? `deadline ${c.deadline.slice(0, 10)}` : undefined,
          c.enabledDate ? `enabled ${c.enabledDate.slice(0, 10)}` : undefined,
          c.evaluationMetric ? `metric ${c.evaluationMetric}` : undefined,
          c.organizationName ?? undefined,
          tags.join(', '),
        ].filter(Boolean).join(' | '),
        summary: truncate(c.description ?? c.subtitle ?? undefined),
      };
    })
    .filter((h) => h.title && h.url);
}

async function searchKaggle(query: string, limit: number, kind: KaggleKind, recentDays?: number): Promise<SourceHit[]> {
  const authHeaders = resolveKaggleAuthHeaders(process.env);
  const hasAuth = Object.keys(authHeaders).length > 0;
  const calls: Promise<SourceHit[]>[] = [];

  if (kind === 'datasets' || kind === 'both') {
    calls.push(searchKaggleDatasets(query, limit, authHeaders, recentDays));
  }
  if (kind === 'competitions' && !hasAuth) {
    throw new Error('Kaggle competitions require auth; set KAGGLE_API_TOKEN or KAGGLE_USERNAME/KAGGLE_KEY');
  }
  if (kind === 'competitions' || (kind === 'both' && hasAuth)) {
    calls.push(searchKaggleCompetitions(query, limit, authHeaders, recentDays));
  }

  const settled = await Promise.allSettled(calls);
  const hits = settled
    .filter((result): result is PromiseFulfilledResult<SourceHit[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  if (hits.length > 0) return hits.slice(0, limit * (kind === 'both' ? 2 : 1));

  const error = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (error) throw error.reason;
  return [];
}

async function searchKaggleDatasets(
  query: string,
  limit: number,
  authHeaders: Record<string, string>,
  recentDays?: number,
): Promise<SourceHit[]> {
  const params = new URLSearchParams({
    search: query,
    pageSize: String(fetchLimitForRecent(limit, recentDays)),
    ...(recentDays ? { sortBy: 'updated' } : {}),
  });
  const resp = await fetch(`https://www.kaggle.com/api/v1/datasets/list?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
      ...authHeaders,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Kaggle HTTP ${resp.status}`);
  return parseKaggleDatasets(await resp.json(), limit, recentDays);
}

async function searchKaggleCompetitions(
  query: string,
  limit: number,
  authHeaders: Record<string, string>,
  recentDays?: number,
): Promise<SourceHit[]> {
  const params = new URLSearchParams({
    search: query,
    pageSize: String(fetchLimitForRecent(limit, recentDays)),
    group: 'general',
    sortBy: recentDays ? 'recentlyCreated' : 'latestDeadline',
  });
  const resp = await fetch(`https://www.kaggle.com/api/v1/competitions/list?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
      ...authHeaders,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Kaggle competitions HTTP ${resp.status}`);
  return parseKaggleCompetitions(await resp.json(), limit, recentDays);
}

function resolveKaggleAuthHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const apiToken = resolveKaggleApiToken(env);
  if (apiToken) return { Authorization: `Bearer ${apiToken}` };

  const legacy = resolveKaggleLegacyCredentials(env);
  if (!legacy) return {};
  const encoded = Buffer.from(`${legacy.username}:${legacy.key}`, 'utf-8').toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

function hasKaggleAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.keys(resolveKaggleAuthHeaders(env)).length > 0;
}

function resolveKaggleApiToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = firstNonEmpty(env.KAGGLE_API_TOKEN, env.KAGGLE_TOKEN);
  if (explicit) return explicit;

  const configDir = firstNonEmpty(env.KAGGLE_CONFIG_DIR)
    ? resolveHomePath(firstNonEmpty(env.KAGGLE_CONFIG_DIR)!)
    : join(homedir(), '.kaggle');
  return readTextFileIfPresent(join(configDir, 'access_token'));
}

function resolveKaggleLegacyCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { username: string; key: string } | undefined {
  const username = firstNonEmpty(env.KAGGLE_USERNAME);
  const key = firstNonEmpty(env.KAGGLE_KEY);
  if (username && key) return { username, key };

  const configDir = firstNonEmpty(env.KAGGLE_CONFIG_DIR)
    ? resolveHomePath(firstNonEmpty(env.KAGGLE_CONFIG_DIR)!)
    : join(homedir(), '.kaggle');
  const raw = readTextFileIfPresent(join(configDir, 'kaggle.json'));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { username?: unknown; key?: unknown };
    const fileUsername = typeof parsed.username === 'string' ? parsed.username.trim() : '';
    const fileKey = typeof parsed.key === 'string' ? parsed.key.trim() : '';
    if (fileUsername && fileKey) return { username: fileUsername, key: fileKey };
  } catch {
    return undefined;
  }
  return undefined;
}

function formatHits(query: string, hits: SourceHit[], errors: string[], notes: string[] = []): string {
  if (hits.length === 0 && errors.length === 0 && notes.length === 0) {
    return `No source results for "${query}". Try a broader query.`;
  }
  const lines: string[] = [`Research source results for "${query}"`, ''];
  if (notes.length > 0) {
    lines.push('## Coverage notes');
    for (const note of notes) lines.push(`- ${note}`);
    lines.push('');
  }
  lines.push(...buildSourceDigest(hits, errors), '');
  for (const h of hits) {
    lines.push(`## ${h.source}: ${h.title}`);
    lines.push(h.url);
    if (h.meta) lines.push(h.meta);
    if (h.summary) lines.push(h.summary);
    lines.push('');
  }
  if (errors.length > 0) {
    lines.push('## Source errors');
    for (const e of errors) lines.push(`- ${e}`);
  }
  return lines.join('\n').trim();
}

function buildSourceDigest(hits: SourceHit[], errors: string[]): string[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    counts.set(hit.source, (counts.get(hit.source) ?? 0) + 1);
  }
  const sources = Array.from(counts.entries())
    .map(([source, count]) => `${source}=${count}`)
    .join(' | ') || 'none';
  const topUrls = Array.from(new Set(hits.map((hit) => hit.url).filter(Boolean))).slice(0, 6);
  return [
    '## Source digest',
    `- hits: ${hits.length}`,
    `- errors: ${errors.length}`,
    `- sources: ${sources}`,
    `- top_urls: ${topUrls.length ? topUrls.join(' | ') : 'none'}`,
  ];
}

export const ResearchSourcesTool: Tool = {
  name: 'research_sources',
  description:
    'Search current source-specific research/code/data repositories: arXiv papers, GitHub repos/issues/PRs/code, Hugging Face papers/models/datasets, and Kaggle datasets/competitions. Use before benchmark-driven or science-backed implementation decisions. Returns titles, URLs, metadata, and short summaries.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query, e.g. "LLM coding agent verification SWE-bench".',
      },
      source: {
        type: 'string',
        enum: ['all', 'arxiv', 'github', 'huggingface', 'kaggle'],
        description: 'Source to query. Use "all" for a compact cross-source scan.',
      },
      kind: {
        type: 'string',
        enum: ['models', 'datasets', 'papers', 'both', 'all'],
        description: 'For Hugging Face only: search models, datasets, papers, both models+datasets, or all. Default all.',
      },
      github_kind: {
        type: 'string',
        enum: ['repositories', 'issues', 'pulls', 'code', 'all'],
        description: 'For GitHub only: search repositories, issues, pull requests, code, or all. Default repositories.',
      },
      kaggle_kind: {
        type: 'string',
        enum: ['datasets', 'competitions', 'both'],
        description: 'For Kaggle only: search datasets, competitions, or both. Default both; unauthenticated both falls back to datasets.',
      },
      limit: {
        type: 'number',
        description: 'Results per source (default 5, max 10).',
      },
      recent_days: {
        type: 'number',
        description: 'Optional recency window. Applies directly to arXiv and GitHub repo/issue/pull queries, sorts and filters Hugging Face/Kaggle date metadata when available, and records caveats for endpoints without date qualifiers.',
      },
    },
    required: ['query'],
  },
  isReadOnly: true,
  isDestructive: false,

  async call(input): Promise<ToolResult> {
    const query = String(input.query || '').trim();
    if (!query) return { output: 'research_sources: missing required parameter "query"', isError: true };
    const source = (String(input.source || 'all').toLowerCase() as ResearchSource);
    const githubKind = (String(input.github_kind || 'repositories').toLowerCase() as GitHubKind);
    const kind = (String(input.kind || 'all').toLowerCase() as HuggingFaceKind);
    const kaggleKind = (String(input.kaggle_kind || 'both').toLowerCase() as KaggleKind);
    const limit = Math.max(1, Math.min(10, Number(input.limit) || 5));
    const recentDays = Number.isFinite(Number(input.recent_days)) && Number(input.recent_days) > 0
      ? Math.min(3650, Math.floor(Number(input.recent_days)))
      : undefined;

    const sources: ResearchSource[] = source === 'all'
      ? ['arxiv', 'github', 'huggingface', 'kaggle']
      : [source];
    if (sources.some((s) => !['arxiv', 'github', 'huggingface', 'kaggle'].includes(s))) {
      return { output: `research_sources: unsupported source "${source}"`, isError: true };
    }
    if (!['models', 'datasets', 'papers', 'both', 'all'].includes(kind)) {
      return { output: `research_sources: unsupported kind "${kind}"`, isError: true };
    }
    if (!['repositories', 'issues', 'pulls', 'code', 'all'].includes(githubKind)) {
      return { output: `research_sources: unsupported github_kind "${githubKind}"`, isError: true };
    }
    if (!['datasets', 'competitions', 'both'].includes(kaggleKind)) {
      return { output: `research_sources: unsupported kaggle_kind "${kaggleKind}"`, isError: true };
    }

    const notes = buildCoverageNotes(sources, githubKind, kind, kaggleKind, recentDays);
    const results = await Promise.all(sources.map(async (s): Promise<SourceSearchResult> => {
      const sourceHits: SourceHit[] = [];
      try {
        if (s === 'arxiv') sourceHits.push(...await searchArxiv(query, limit, recentDays));
        if (s === 'github') sourceHits.push(...await searchGitHub(query, limit, recentDays, githubKind));
        if (s === 'huggingface') sourceHits.push(...await searchHuggingFace(query, limit, kind, recentDays));
        if (s === 'kaggle') sourceHits.push(...await searchKaggle(query, limit, kaggleKind, recentDays));
        return { source: s, hits: sourceHits };
      } catch (e) {
        return { source: s, hits: [], error: `${s}: ${e instanceof Error ? e.message : String(e)}` };
      }
    }));
    const hits = results.flatMap((result) => result.hits);
    const errors = results.flatMap((result) => result.error ? [result.error] : []);

    return {
      output: formatHits(query, hits, errors, notes),
      isError: hits.length === 0 && errors.length > 0,
    };
  },
};

function buildCoverageNotes(
  sources: ResearchSource[],
  githubKind: GitHubKind,
  kind: HuggingFaceKind,
  kaggleKind: KaggleKind,
  recentDays?: number,
): string[] {
  const notes: string[] = [];
  if (sources.includes('arxiv')) notes.push('arXiv papers requested.');
  if (sources.includes('github')) notes.push(`GitHub ${githubKind} requested.`);
  if (sources.includes('huggingface')) notes.push(`Hugging Face ${kind} requested.`);
  if (recentDays && recentDays > 0) {
    notes.push(`Recency filter requested: recent_days=${recentDays}.`);
    if (sources.includes('github') && (githubKind === 'code' || githubKind === 'all')) {
      notes.push('GitHub code search has no supported pushed/updated date qualifier; treat code hits as implementation examples, not freshness proof.');
    }
    if (sources.includes('huggingface') && (kind === 'papers' || kind === 'all')) {
      notes.push('Hugging Face daily papers are checked across the most recent available daily pages, capped at 30 days.');
    }
    if (sources.includes('huggingface') && (kind === 'models' || kind === 'datasets' || kind === 'both' || kind === 'all')) {
      notes.push('Hugging Face model/dataset searches are sorted by lastModified and stale dated hits are filtered client-side when metadata is available.');
    }
    if (sources.includes('kaggle')) {
      notes.push('Kaggle datasets use sortBy=updated and competitions use sortBy=recentlyCreated when recent_days is requested; stale dated hits are filtered client-side when metadata is available.');
    }
  }
  if (sources.includes('kaggle')) {
    const authed = hasKaggleAuth(process.env);
    notes.push(`Kaggle ${kaggleKind} requested; competitions ${authed ? 'enabled by auth' : 'require auth'}.`);
    if (kaggleKind === 'both' && !authed) {
      notes.push('Kaggle unauthenticated fallback: competitions skipped, datasets queried only.');
    }
  }
  if (
    sources.includes('arxiv') &&
    sources.includes('github') && githubKind === 'all' &&
    sources.includes('huggingface') && kind === 'all' &&
    sources.includes('kaggle') && kaggleKind === 'both'
  ) {
    notes.push('Targeted benchmark coverage requested: arXiv + GitHub all + Hugging Face all + Kaggle both.');
  }
  return notes;
}

export const _internal = {
  buildArxivQuery,
  parseArxivFeed,
  parseGitHubRepos,
  parseGitHubIssues,
  parseGitHubCode,
  parseHuggingFaceRepos,
  parseHuggingFacePapers,
  parseKaggleDatasets,
  parseKaggleCompetitions,
  dateWithinRecentDays,
  normalizeKaggleUrl,
  normalizeKaggleCompetitionUrl,
  resolveHuggingFaceToken,
  resolveKaggleApiToken,
  resolveKaggleAuthHeaders,
  hasKaggleAuth,
  resolveKaggleLegacyCredentials,
  buildCoverageNotes,
  formatHits,
};
