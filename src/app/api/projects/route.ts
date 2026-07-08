import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '../../../lib/projectsDb';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const project = createProject({
      name: body.name,
      thumbnail: body.thumbnail ?? null,
      image_path: body.image_path ?? null,
      state_json: body.state_json,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Failed to create project', error);
    return NextResponse.json({ error: 'PROJECT_CREATE_FAILED' }, { status: 400 });
  }
}
