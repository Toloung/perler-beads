import {
  DatabaseBackupSummary,
  ProjectDetail,
  ProjectState,
  ProjectSummary,
  ProjectVersionDetail,
  ProjectVersionSummary,
  VersionConflict,
} from '../types/projectTypes';

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data as T;
}

export async function fetchProjects(options?: { archived?: boolean }): Promise<ProjectSummary[]> {
  const query = options?.archived ? '?archived=1' : '';
  const data = await readJson<{ projects: ProjectSummary[] }>(await fetch(`/api/projects${query}`));
  return data.projects;
}

export async function fetchProject(id: string): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(await fetch(`/api/projects/${id}`));
}

export async function createProjectOnServer(input: {
  name: string;
  thumbnail: string | null;
  state_json: ProjectState;
}): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
}

export async function updateProjectOnServer(input: {
  id: string;
  name: string;
  thumbnail: string | null;
  state_json: ProjectState;
  version: number;
  force?: boolean;
}): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(
    await fetch(`/api/projects/${input.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
}

export async function renameProjectOnServer(id: string, name: string): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  );
}

export async function deleteProjectOnServer(id: string): Promise<void> {
  await readJson<{ ok: true }>(
    await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
    })
  );
}

export async function setProjectArchivedOnServer(id: string, archived: boolean): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    })
  );
}

export async function fetchProjectVersions(id: string): Promise<ProjectVersionSummary[]> {
  const data = await readJson<{ versions: ProjectVersionSummary[] }>(await fetch(`/api/projects/${id}/versions`));
  return data.versions;
}

export async function fetchProjectVersion(id: string, version: number): Promise<ProjectVersionDetail> {
  return readJson<ProjectVersionDetail>(await fetch(`/api/projects/${id}/versions/${version}`));
}

export async function restoreProjectVersionOnServer(id: string, version: number): Promise<ProjectDetail> {
  return readJson<ProjectDetail>(
    await fetch(`/api/projects/${id}/versions/${version}`, {
      method: 'POST',
    })
  );
}

export async function fetchDatabaseBackups(): Promise<DatabaseBackupSummary[]> {
  const data = await readJson<{ backups: DatabaseBackupSummary[] }>(await fetch('/api/backups'));
  return data.backups;
}

export async function createDatabaseBackupOnServer(label?: string): Promise<DatabaseBackupSummary> {
  return readJson<DatabaseBackupSummary>(
    await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
  );
}

export function isVersionConflict(error: unknown): error is VersionConflict {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'error' in error &&
      (error as { error?: string }).error === 'VERSION_CONFLICT'
  );
}
