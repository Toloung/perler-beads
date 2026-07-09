import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectVersion, restoreProjectVersion } from '../../../../../../lib/projectsDb';
import { publishProjectEvent } from '../../../../../../lib/projectEvents';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string; version: string }>;
};

function parseVersion(value: string) {
  const version = Number.parseInt(value, 10);
  return Number.isFinite(version) && version > 0 ? version : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id, version: versionParam } = await context.params;
  const version = parseVersion(versionParam);

  if (!version) {
    return NextResponse.json({ error: 'INVALID_VERSION' }, { status: 400 });
  }

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
  }

  const snapshot = getProjectVersion(id, version);
  if (!snapshot) {
    return NextResponse.json({ error: 'PROJECT_VERSION_NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id, version: versionParam } = await context.params;
  const version = parseVersion(versionParam);

  if (!version) {
    return NextResponse.json({ error: 'INVALID_VERSION' }, { status: 400 });
  }

  const project = restoreProjectVersion(id, version);
  if (!project) {
    return NextResponse.json({ error: 'PROJECT_VERSION_NOT_FOUND' }, { status: 404 });
  }

  publishProjectEvent({
    type: 'restored',
    projectId: project.id,
    version: project.version,
    name: project.name,
    updated_at: project.updated_at,
  });

  return NextResponse.json(project);
}
