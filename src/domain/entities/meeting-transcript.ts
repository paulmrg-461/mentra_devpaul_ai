export interface MeetingEntry {
  text: string;
  timestamp: number;
}

export class MeetingTranscript {
  private entries: MeetingEntry[] = [];
  readonly startedAt: number;

  constructor() {
    this.startedAt = Date.now();
  }

  addEntry(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.entries.push({ text: trimmed, timestamp: Date.now() });
  }

  getFullText(): string {
    return this.entries.map(e => e.text).join(' ');
  }

  getDurationMinutes(): number {
    return Math.round((Date.now() - this.startedAt) / 60000);
  }

  get entryCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}
