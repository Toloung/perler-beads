import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { ProjectDetail, ProjectState, ProjectSummary } from '../types/projectTypes';

type ProjectRow = {
  id: string;
  name: string;
  thumbnail: string | null;
  image_path: string | null;
  state_json: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

let db: Database.Database | null = null;

export function getDataDir() {
  return process.env.PERLER_DATA_DIR || path.join(process.cwd(), 'data', 'perler');
}

function getDbPath() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  return path.join(dataDir, 'perler.db');
}

export function getProjectsDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        thumbnail TEXT,
        image_path TEXT,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_projects_updated_at
        ON projects(updated_at DESC)
        WHERE deleted_at IS NULL;
    `);
  }

  return db;
}

function rowToSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToDetail(row: ProjectRow): ProjectDetail {
  return {
    ...rowToSummary(row),
    image_path: row.image_path,
    state_json: JSON.parse(row.state_json) as ProjectState,
  };
}

export function listProjects() {
  const rows = getProjectsDb()
    .prepare('SELECT id, name, thumbnail, image_path, state_json, version, created_at, updated_at, deleted_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC')
    .all() as ProjectRow[];

  return rows.map(rowToSummary);
}

export function getProject(id: string) {
  const row = getProjectsDb()
    .prepare('SELECT id, name, thumbnail, image_path, state_json, version, created_at, updated_at, deleted_at FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(id) as ProjectRow | undefined;

  return row ? rowToDetail(row) : null;
}

export function createProject(input: {
  name: string;
  thumbnail?: string | null;
  image_path?: string | null;
  state_json: ProjectState;
}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  getProjectsDb()
    .prepare(`
      INSERT INTO projects (id, name, thumbnail, image_path, state_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      id,
      input.name.trim() || '未命名项目',
      input.thumbnail ?? null,
      input.image_path ?? null,
      JSON.stringify(input.state_json),
      now,
      now
    );

  const project = getProject(id);
  if (!project) {
    throw new Error('PROJECT_CREATE_FAILED');
  }

  return project;
}

export function updateProject(input: {
  id: string;
  name?: string;
  thumbnail?: string | null;
  image_path?: string | null;
  state_json: ProjectState;
  version: number;
  force?: boolean;
}) {
  const current = getProject(input.id);
  if (!current) {
    return { status: 'not-found' as const };
  }

  if (!input.force && current.version !== input.version) {
    return {
      status: 'conflict' as const,
      serverVersion: current.version,
      clientVersion: input.version,
    };
  }

  const now = new Date().toISOString();
  const nextVersion = current.version + 1;

  getProjectsDb()
    .prepare(`
      UPDATE projects
      SET name = ?, thumbnail = ?, image_path = ?, state_json = ?, version = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `)
    .run(
      (input.name ?? current.name).trim() || current.name,
      input.thumbnail ?? current.thumbnail,
      input.image_path ?? current.image_path,
      JSON.stringify(input.state_json),
      nextVersion,
      now,
      input.id
    );

  return { status: 'ok' as const, project: getProject(input.id)! };
}

export function renameProject(id: string, name: string) {
  const now = new Date().toISOString();
  const result = getProjectsDb()
    .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(name.trim() || '未命名项目', now, id);

  return result.changes > 0 ? getProject(id) : null;
}

export function deleteProject(id: string) {
  const now = new Date().toISOString();
  const result = getProjectsDb()
    .prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, now, id);

  return result.changes > 0;
}
