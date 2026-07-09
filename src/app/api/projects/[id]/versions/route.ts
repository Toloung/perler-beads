import { NextRequest, NextResponse } from 'next/server';
import { getProject, listProjectVersions } from '../../../../../lib/projectsDb';

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

  return NextResponse.json({ versions: listProjectVersions(id) });
}
