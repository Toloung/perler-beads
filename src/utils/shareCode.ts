import { ProjectState } from '../types/projectTypes';

type BackupCodePayload = {
  type: 'perler-backup';
  version: 2;
  name: string;
  state: ProjectState;
};

type LegacyBackupPayload = {
  type: 'perler-share';
  version: 1;
  encrypted: boolean;
  name?: string;
  state?: ProjectState;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodePayload(code: string) {
  const cleanCode = code.trim().replace(/^(?:perler-backup|perler):/, '');
  return JSON.parse(new TextDecoder().decode(base64ToBytes(cleanCode))) as BackupCodePayload | LegacyBackupPayload;
}

export async function createShareCode(input: { name: string; state: ProjectState }) {
  const payload: BackupCodePayload = {
    type: 'perler-backup',
    version: 2,
    name: input.name,
    state: input.state,
  };
  return `perler-backup:${bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

export async function readShareCode(code: string) {
  const payload = decodePayload(code);

  if (payload.type === 'perler-backup' && payload.version === 2) {
    return { name: payload.name, state: payload.state };
  }

  if (payload.type === 'perler-share' && payload.version === 1 && !payload.encrypted && payload.state) {
    return { name: payload.name || '备份项目', state: payload.state };
  }

  if (payload.type === 'perler-share' && payload.encrypted) {
    throw new Error('这是旧版加密分享码，请在旧版本中导入后重新导出备份码');
  }

  throw new Error('备份码格式不正确');
}
