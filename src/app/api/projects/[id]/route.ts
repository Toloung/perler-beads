import { NextRequest, NextResponse } from 'next/server';
import { deleteProject, markProjectOpened, renameProject, setProjectArchived, updateProject } from '../../../../lib/projectsDb';
import { publishProjectEvent } from '../../../../lib/projectEvents';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const project = markProjectOpened(id);

  if (!project) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = updateProject({
      id,
      name: body.name,
      thumbnail: body.thumbnail ?? null,
      image_path: body.image_path ?? null,
      state_json: body.state_json,
      version: body.version,
      force: body.force === true,
      create_snapshot: body.create_snapshot === true,
    });

    if (result.status === 'not-found') {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    if (result.status === 'conflict') {
      return NextResponse.json(
        {
          error: 'VERSION_CONFLICT',
          serverVersion: result.serverVersion,
          clientVersion: result.clientVersion,
        },
        { status: 409 }
      );
    }

    publishProjectEvent({
      type: 'updated',
      projectId: result.project.id,
      version: result.project.version,
      name: result.project.name,
      updated_at: result.project.updated_at,
    });

    return NextResponse.json(result.project);
  } catch (error) {
    console.error('Failed to update project', error);
    return NextResponse.json({ error: 'PROJECT_UPDATE_FAILED' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const project = typeof body.archived === 'boolean'
      ? setProjectArchived(id, body.archived)
      : renameProject(id, body.name);

    if (!project) {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    publishProjectEvent({
      type: body.archived === true ? 'archived' : body.archived === false ? 'restored' : 'renamed',
      projectId: project.id,
      version: project.version,
      name: project.name,
      updated_at: project.updated_at,
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to rename project', error);
    return NextResponse.json({ error: 'PROJECT_RENAME_FAILED' }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const deleted = deleteProject(id);

  if (!deleted) {
    return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
  }

  publishProjectEvent({
    type: 'deleted',
    projectId: deleted.id,
    version: deleted.version,
    name: deleted.name,
    updated_at: deleted.updated_at,
  });

  return NextResponse.json({ ok: true });
}
