const STORAGE_KEY = 'nova-session-archives';
const ACTIVE_KEY = 'nova-session-archive-active';
const PENDING_KEY = 'nova-session-archive-pending';

function readList() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(entries) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function previewFromArchive(archive) {
  return {
    id: archive.id,
    title: archive.title,
    assistantName: archive.assistantName,
    personaMode: archive.personaMode,
    responseMode: archive.responseMode,
    messageCount: archive.messageCount,
    requiresPassphrase: Boolean(archive.requiresPassphrase),
    encryptionMode: archive.encryptionMode,
    savedAt: archive.savedAt,
    tags: archive.tags || [],
  };
}

export function buildDefaultNovaArchiveTitle(assistantName) {
  return `${assistantName || 'Session'} ${new Date().toLocaleString()}`;
}

export async function listNovaSessionArchives() {
  return readList().map(previewFromArchive);
}

export async function saveNovaSessionArchive({
  title,
  tags,
  messages,
  sessionId,
  assistantName,
  personaMode,
  responseMode,
  passphrase,
}) {
  const storable = (messages || []).filter((message) => String(message?.content || '').trim());
  const transcriptText = storable
    .map((message) => `${message.role === 'assistant' ? assistantName || 'Assistant' : 'You'}: ${message.content}`)
    .join('\n\n');
  const archive = {
    id: `archive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(title || '').trim() || buildDefaultNovaArchiveTitle(assistantName),
    tags: String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    messages: storable,
    sessionId: sessionId || '',
    assistantName: assistantName || 'Jarvis',
    personaMode: personaMode || '',
    responseMode: responseMode || '',
    messageCount: storable.length,
    requiresPassphrase: Boolean(String(passphrase || '').trim()),
    encryptionMode: String(passphrase || '').trim() ? 'passphrase' : 'device',
    passphrase: String(passphrase || '').trim(),
    transcriptText,
    excerpt: transcriptText.slice(0, 280),
    savedAt: new Date().toISOString(),
  };
  writeList([archive, ...readList()].slice(0, 40));
  return previewFromArchive(archive);
}

export async function openNovaSessionArchive(archiveId, { passphrase } = {}) {
  const archive = readList().find((entry) => entry.id === archiveId);
  if (!archive) {
    throw new Error('That session archive is not on this device.');
  }
  if (archive.requiresPassphrase && archive.passphrase !== String(passphrase || '').trim()) {
    throw new Error('That passphrase did not unlock the archive.');
  }
  return archive;
}

export async function deleteNovaSessionArchive(archiveId) {
  writeList(readList().filter((entry) => entry.id !== archiveId));
}

export function getActiveNovaSessionArchive() {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setActiveNovaSessionArchive(archive) {
  window.sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(archive || null));
  return archive;
}

export function clearActiveNovaSessionArchive() {
  window.sessionStorage.removeItem(ACTIVE_KEY);
}

export function setPendingNovaSessionArchive(archive) {
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(archive || null));
  return archive;
}

export function consumePendingNovaSessionArchive() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    window.sessionStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function toLoadedSessionArchivePayload(archive) {
  if (!archive) {
    return null;
  }
  return {
    id: archive.id,
    title: archive.title,
    transcript_text: archive.transcriptText,
    excerpt: archive.excerpt,
  };
}
