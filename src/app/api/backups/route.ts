import { NextRequest, NextResponse } from 'next/server';
import { createDatabaseBackup, listDatabaseBackups } from '../../../lib/projectsDb';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ backups: listDatabaseBackups() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const backup = createDatabaseBackup(body.label);
    return NextResponse.json(backup, { status: 201 });
  } catch (error) {
    console.error('Failed to create backup', error);
    return NextResponse.json({ error: 'BACKUP_CREATE_FAILED' }, { status: 400 });
  }
}
