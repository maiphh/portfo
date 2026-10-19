/**
 * Database schema for the backend described in docs/architecture.md.
 * Neon Postgres + pgvector. Change this file, then run `pnpm db:generate`
 * to write a new SQL migration into ./drizzle.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** Embedding size of OpenAI text-embedding-3-small. The embedding model must match it. */
export const EMBEDDING_DIMENSIONS = 1536;

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const documentSource = pgEnum("document_source", ["cv", "case_study"]);
export const contactCategory = pgEnum("contact_category", ["recruiter", "client", "other", "spam"]);
export const contactStatus = pgEnum("contact_status", ["new", "classified", "notified", "failed"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);
export const syncStatus = pgEnum("sync_status", ["running", "success", "failed"]);

/** Source documents for RAG: the CV and each case study. */
export const documents = pgTable(
  "documents",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: documentSource("source").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Hash of the source text; ingest re-embeds only when it changes. */
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("documents_source_slug_key").on(t.source, t.slug)],
);

/** Embedded chunks of a document. Searched by cosine distance through an HNSW index. */
export const chunks = pgTable(
  "chunks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    uniqueIndex("chunks_document_idx_key").on(t.documentId, t.idx),
    index("chunks_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/** One row per answered question. visitor_hash, never a raw IP. */
export const chatLogs = pgTable(
  "chat_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    visitorHash: text("visitor_hash").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sourceChunkIds: integer("source_chunk_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("chat_logs_created_at_idx").on(t.createdAt)],
);

export const githubRepos = pgTable("github_repos", {
  /** GitHub's numeric repository id (databaseId). */
  repoId: bigint("repo_id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  language: text("language"),
  stars: integer("stars").notNull().default(0),
  topics: text("topics")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
});

/** Daily rollup of contributions per repository. */
export const githubActivity = pgTable(
  "github_activity",
  {
    date: date("date", { mode: "string" }).notNull(),
    repoId: bigint("repo_id", { mode: "number" })
      .notNull()
      .references(() => githubRepos.repoId, { onDelete: "cascade" }),
    commits: integer("commits").notNull().default(0),
    prs: integer("prs").notNull().default(0),
    issues: integer("issues").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.date, t.repoId] })],
);

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    body: text("body").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    category: contactCategory("category"),
    confidence: real("confidence"),
    status: contactStatus("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("contact_messages_status_idx").on(t.status)],
);

/** Postgres-backed job queue. See src/db/queue.ts. */
export const jobs = pgTable(
  "jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    /** Set when a worker claims the job; lets a sweeper find stuck jobs. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_run_after_idx").on(t.status, t.runAfter)],
);

/** One row per visitor, page and calendar day (Asia/Ho_Chi_Minh). See src/server/analytics. */
export const pageViews = pgTable(
  "page_views",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    slug: text("slug").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    referrerHost: text("referrer_host"),
    /** Calendar day in Asia/Ho_Chi_Minh; part of the dedupe key. */
    day: date("day", { mode: "string" })
      .notNull()
      .default(sql`(now() at time zone 'Asia/Ho_Chi_Minh')::date`),
    createdAt: createdAt(),
  },
  (t) => [
    index("page_views_slug_created_at_idx").on(t.slug, t.createdAt),
    uniqueIndex("page_views_visitor_slug_day_key").on(t.visitorHash, t.slug, t.day),
  ],
);

/** Fixed-window counters. See src/db/rate-limit.ts. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const syncRuns = pgTable("sync_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  kind: text("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatus("status").notNull().default("running"),
  error: text("error"),
});

export type Job = typeof jobs.$inferSelect;
