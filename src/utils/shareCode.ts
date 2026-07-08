import { ProjectState } from '../types/projectTypes';

export type ShareCodePayload =
  | {
      type: 'perler-share';
      version: 1;
      encrypted: false;
      name: string;
      state: ProjectState;
    }
  | {
      type: 'perler-share';
      version: 1;
      encrypted: true;
      salt: string;
      iv: string;
      data: string;
    };

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function encodePayload(payload: ShareCodePayload) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(code: string) {
  const cleanCode = code.trim().replace(/^perler:/, '');
  const text = new TextDecoder().decode(base64ToBytes(cleanCode));
  return JSON.parse(text) as ShareCodePayload;
}

async function getEncryptionKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createShareCode(input: {
  name: string;
  state: ProjectState;
  password?: string;
}) {
  if (!input.password) {
    return `perler:${encodePayload({
      type: 'perler-share',
      version: 1,
      encrypted: false,
      name: input.name,
      state: input.state,
    })}`;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(input.password, salt);
  const data = new TextEncoder().encode(JSON.stringify({ name: input.name, state: input.state }));
  const encryptedData = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));

  return `perler:${encodePayload({
    type: 'perler-share',
    version: 1,
    encrypted: true,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(encryptedData),
  })}`;
}

export async function readShareCode(code: string, password?: string) {
  const payload = decodePayload(code);

  if (payload.type !== 'perler-share' || payload.version !== 1) {
    throw new Error('分享码格式不正确');
  }

  if (!payload.encrypted) {
    return { name: payload.name, state: payload.state };
  }

  if (!password) {
    throw new Error('此作品为私密作品，需要密码才能导入');
  }

  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const key = await getEncryptionKey(password, salt);
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(payload.data)
    );
    return JSON.parse(new TextDecoder().decode(decryptedData)) as { name: string; state: ProjectState };
  } catch {
    throw new Error('密码错误，请确认后重试');
  }
}
