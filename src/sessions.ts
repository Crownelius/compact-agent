/**
 * Session persistence — save, resume, list, delete conversations.
 * Stores sessions as JSON files in ~/.compact-agent/sessions/
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from './config.js';
import type { Message } from './types.js';

const SESSIONS_DIR = join(getConfigDir(), 'sessions');

// Simple write lock to prevent concurrent writes
let isWriting = false;
const writeQueue: (() => Promise<void>)[] = [];

async function acquireWriteLock(fn: () => void): Promise<void> {
  return new Promise((resolve) => {
    const task = async () => {
      fn();
      resolve();
    };

    if (!isWriting) {
      isWriting = true;
      task().finally(() => {
        isWriting = false;
        const next = writeQueue.shift();
        if (next) next();
      });
    } else {
      writeQueue.push(task);
    }
  });
}

export interface Session {
  id: string;
  name: string;
  cwd: string;
  model: string;
  provider: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  tokenCount: number;
  turnCount: number;
  mode: string;
}

function ensureDir(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function saveSession(session: Session): Promise<void> {
  return acquireWriteLock(() => {
    ensureDir();
    session.updatedAt = new Date().toISOString();
    session.turnCount = session.messages.filter((m) => m.role === 'user').length;
    writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
  });
}

export function loadSession(id: string): Session | null {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function listSessions(): Pick<Session, 'id' | 'name' | 'cwd' | 'model' | 'createdAt' | 'updatedAt' | 'turnCount'>[] {
  ensureDir();
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  const sessions: ReturnType<typeof listSessions> = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
      const s = JSON.parse(raw) as Session;
      sessions.push({
        id: s.id,
        name: s.name,
        cwd: s.cwd,
        model: s.model,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        turnCount: s.turnCount,
      });
    } catch {
      // skip corrupt files
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteSession(id: string): boolean {
  const p = sessionPath(id);
  if (!existsSync(p)) return false;
  unlinkSync(p);
  return true;
}

export function createSession(cwd: string, model: string, provider: string, mode: string): Session {
  return {
    id: generateSessionId(),
    name: `Session ${new Date().toLocaleString()}`,
    cwd,
    model,
    provider,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokenCount: 0,
    turnCount: 0,
    mode,
  };
}

export async function autoSave(session: Session, messages: Message[]): Promise<void> {
  session.messages = messages;
  await saveSession(session);
}
