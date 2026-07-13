import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  DatabaseBackupSummary,
  ProjectDetail,
  ProjectState,
  ProjectSummary,
  ProjectVersionAction,
  ProjectVersionDetail,
  ProjectVersionSummary,
} from '../types/projectTypes';

type ProjectRow = {
  id: string;
  name: string;
  thumbnail: string | null;
  image_path: string | null;
  state_json: string;
  version: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

type ProjectVersionRow = {
  project_id: string;
  version: number;
  name: string;
  thumbnail: string | null;
  image_path: string | null;
  state_json: string;
  action: ProjectVersionAction;
  created_at: string;
};

let db: Database.Database | null = null;

export function getDataDir() {
  return process.env.PERLER_DATA_DIR || path.join(process.cwd(), 'data', 'perler');
}

export function getBackupDir() {
  const backupDir = path.join(getDataDir(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

export function getDbPath() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  return path.join(dataDir, 'perler.db');
}

function createSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      thumbnail TEXT,
      image_path TEXT,
      state_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT,
      archived_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_projects_updated_at
      ON projects(updated_at DESC)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS project_versions (
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      thumbnail TEXT,
      image_path TEXT,
      state_json TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_project_versions_project_created
      ON project_versions(project_id, created_at DESC);
  `);

  const projectColumns = database.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>;
  if (!projectColumns.some(column => column.name === 'last_opened_at')) {
    database.exec('ALTER TABLE projects ADD COLUMN last_opened_at TEXT');
  }
  if (!projectColumns.some(column => column.name === 'archived_at')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived_at TEXT');
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_archived_updated
      ON projects(archived_at, updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_projects_last_opened
      ON projects(last_opened_at DESC)
      WHERE deleted_at IS NULL;
  `);

  database.exec(`
    INSERT OR IGNORE INTO project_versions (
      project_id, version, name, thumbnail, image_path, state_json, action, created_at
    )
    SELECT id, version, name, thumbnail, image_path, state_json, 'update', updated_at
    FROM projects
  `);
}

export function getProjectsDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    createSchema(db);
    ensureDailyBackup();
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
    last_opened_at: row.last_opened_at,
    archived_at: row.archived_at,
  };
}

function rowToDetail(row: ProjectRow): ProjectDetail {
  return {
    ...rowToSummary(row),
    image_path: row.image_path,
    state_json: JSON.parse(row.state_json) as ProjectState,
  };
}

function versionRowToSummary(row: ProjectVersionRow): ProjectVersionSummary {
  return {
    project_id: row.project_id,
    version: row.version,
    name: row.name,
    action: row.action,
    created_at: row.created_at,
  };
}

function versionRowToDetail(row: ProjectVersionRow): ProjectVersionDetail {
  return {
    ...versionRowToSummary(row),
    thumbnail: row.thumbnail,
    image_path: row.image_path,
    state_json: JSON.parse(row.state_json) as ProjectState,
  };
}

function insertVersionSnapshot(database: Database.Database, input: {
  project_id: string;
  version: number;
  name: string;
  thumbnail: string | null;
  image_path: string | null;
  state_json: ProjectState | string;
  action: ProjectVersionAction;
  created_at: string;
}) {
  const stateJson = typeof input.state_json === 'string' ? input.state_json : JSON.stringify(input.state_json);
  database
    .prepare(`
      INSERT OR REPLACE INTO project_versions (
        project_id, version, name, thumbnail, image_path, state_json, action, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.project_id,
      input.version,
      input.name,
      input.thumbnail,
      input.image_path,
      stateJson,
      input.action,
      input.created_at
    );
}

export function listProjects(options?: { archived?: boolean }) {
  const archived = options?.archived === true;
  const rows = getProjectsDb()
    .prepare(`
      SELECT id, name, thumbnail, image_path, state_json, version, created_at, updated_at, last_opened_at, archived_at, deleted_at
      FROM projects
      WHERE deleted_at IS NULL AND ${archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'}
      ORDER BY updated_at DESC
    `)
    .all() as ProjectRow[];

  return rows.map(rowToSummary);
}

export function getProject(id: string) {
  const row = getProjectsDb()
    .prepare('SELECT id, name, thumbnail, image_path, state_json, version, created_at, updated_at, last_opened_at, archived_at, deleted_at FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(id) as ProjectRow | undefined;

  return row ? rowToDetail(row) : null;
}

export function markProjectOpened(id: string) {
  const now = new Date().toISOString();
  getProjectsDb()
    .prepare('UPDATE projects SET last_opened_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, id);
  return getProject(id);
}

export function createProject(input: {
  name: string;
  thumbnail?: string | null;
  image_path?: string | null;
  state_json: ProjectState;
}) {
  const database = getProjectsDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const name = input.name.trim() || '未命名项目';
  const thumbnail = input.thumbnail ?? null;
  const imagePath = input.image_path ?? null;

  database.transaction(() => {
    database
      .prepare(`
        INSERT INTO projects (id, name, thumbnail, image_path, state_json, version, created_at, updated_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `)
      .run(id, name, thumbnail, imagePath, JSON.stringify(input.state_json), now, now, now);

    insertVersionSnapshot(database, {
      project_id: id,
      version: 1,
      name,
      thumbnail,
      image_path: imagePath,
      state_json: input.state_json,
      action: 'create',
      created_at: now,
    });
  })();

  return getProject(id)!;
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

  const database = getProjectsDb();
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;
  const name = (input.name ?? current.name).trim() || current.name;
  const thumbnail = input.thumbnail ?? current.thumbnail;
  const imagePath = input.image_path ?? current.image_path;

  database.transaction(() => {
    database
      .prepare(`
        UPDATE projects
        SET name = ?, thumbnail = ?, image_path = ?, state_json = ?, version = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `)
      .run(name, thumbnail, imagePath, JSON.stringify(input.state_json), nextVersion, now, input.id);

    insertVersionSnapshot(database, {
      project_id: input.id,
      version: nextVersion,
      name,
      thumbnail,
      image_path: imagePath,
      state_json: input.state_json,
      action: 'update',
      created_at: now,
    });
  })();

  return { status: 'ok' as const, project: getProject(input.id)! };
}

export function renameProject(id: string, name: string) {
  const current = getProject(id);
  if (!current) return null;

  const database = getProjectsDb();
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;
  const nextName = name.trim() || '未命名项目';

  database.transaction(() => {
    database
      .prepare('UPDATE projects SET name = ?, version = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(nextName, nextVersion, now, id);

    insertVersionSnapshot(database, {
      project_id: id,
      version: nextVersion,
      name: nextName,
      thumbnail: current.thumbnail,
      image_path: current.image_path,
      state_json: current.state_json,
      action: 'rename',
      created_at: now,
    });
  })();

  return getProject(id);
}

export function setProjectArchived(id: string, archived: boolean) {
  const current = getProject(id);
  if (!current) return null;

  const database = getProjectsDb();
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;
  const action: ProjectVersionAction = archived ? 'archive' : 'restore';

  database.transaction(() => {
    database
      .prepare('UPDATE projects SET archived_at = ?, version = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(archived ? now : null, nextVersion, now, id);

    insertVersionSnapshot(database, {
      project_id: id,
      version: nextVersion,
      name: current.name,
      thumbnail: current.thumbnail,
      image_path: current.image_path,
      state_json: current.state_json,
      action,
      created_at: now,
    });
  })();

  return getProject(id);
}

export function deleteProject(id: string) {
  const current = getProject(id);
  if (!current) return null;

  const database = getProjectsDb();
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;

  database.transaction(() => {
    insertVersionSnapshot(database, {
      project_id: id,
      version: nextVersion,
      name: current.name,
      thumbnail: current.thumbnail,
      image_path: current.image_path,
      state_json: current.state_json,
      action: 'delete',
      created_at: now,
    });

    database
      .prepare('UPDATE projects SET version = ?, deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(nextVersion, now, now, id);
  })();

  return {
    id: current.id,
    name: current.name,
    thumbnail: current.thumbnail,
    version: nextVersion,
    created_at: current.created_at,
    updated_at: now,
    last_opened_at: current.last_opened_at,
    archived_at: current.archived_at,
  } satisfies ProjectSummary;
}

export function listProjectVersions(projectId: string) {
  const rows = getProjectsDb()
    .prepare(`
      SELECT project_id, version, name, thumbnail, image_path, state_json, action, created_at
      FROM project_versions
      WHERE project_id = ?
      ORDER BY version DESC
    `)
    .all(projectId) as ProjectVersionRow[];

  return rows.map(versionRowToSummary);
}

export function getProjectVersion(projectId: string, version: number) {
  const row = getProjectsDb()
    .prepare(`
      SELECT project_id, version, name, thumbnail, image_path, state_json, action, created_at
      FROM project_versions
      WHERE project_id = ? AND version = ?
    `)
    .get(projectId, version) as ProjectVersionRow | undefined;

  return row ? versionRowToDetail(row) : null;
}

export function restoreProjectVersion(projectId: string, version: number) {
  const current = getProject(projectId);
  const snapshot = getProjectVersion(projectId, version);
  if (!current || !snapshot) return null;

  const database = getProjectsDb();
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;

  database.transaction(() => {
    database
      .prepare(`
        UPDATE projects
        SET name = ?, thumbnail = ?, image_path = ?, state_json = ?, version = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `)
      .run(
        snapshot.name,
        snapshot.thumbnail,
        snapshot.image_path,
        JSON.stringify(snapshot.state_json),
        nextVersion,
        now,
        projectId
      );

    insertVersionSnapshot(database, {
      project_id: projectId,
      version: nextVersion,
      name: snapshot.name,
      thumbnail: snapshot.thumbnail,
      image_path: snapshot.image_path,
      state_json: snapshot.state_json,
      action: 'restore',
      created_at: now,
    });
  })();

  return getProject(projectId);
}

function backupName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `perler-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.db`;
}

export function createDatabaseBackup(label?: string) {
  const database = getProjectsDb();
  database.pragma('wal_checkpoint(FULL)');

  const safeLabel = label?.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const fileName = safeLabel ? `${safeLabel}-${backupName()}` : backupName();
  const target = path.join(getBackupDir(), fileName);
  fs.copyFileSync(getDbPath(), target);

  const stats = fs.statSync(target);
  return {
    name: fileName,
    size: stats.size,
    created_at: stats.birthtime.toISOString(),
  } satisfies DatabaseBackupSummary;
}

export function listDatabaseBackups() {
  return fs
    .readdirSync(getBackupDir())
    .filter(file => file.endsWith('.db'))
    .map((file) => {
      const fullPath = path.join(getBackupDir(), file);
      const stats = fs.statSync(fullPath);
      return {
        name: file,
        size: stats.size,
        created_at: stats.birthtime.toISOString(),
      } satisfies DatabaseBackupSummary;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function ensureDailyBackup() {
  const marker = new Date().toISOString().slice(0, 10);
  const exists = listDatabaseBackups().some(backup => backup.name.startsWith(`daily-${marker}`));
  if (exists) return null;

  return createDatabaseBackup(`daily-${marker}`);
}
