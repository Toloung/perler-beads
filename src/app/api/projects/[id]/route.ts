import { NextRequest, NextResponse } from 'next/server';
import { deleteProject, getProject, renameProject, updateProject } from '../../../../lib/projectsDb';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const project = getProject(id);

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
    const project = renameProject(id, body.name);

    if (!project) {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

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

  return NextResponse.json({ ok: true });
}
