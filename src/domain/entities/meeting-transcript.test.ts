import { describe, it, expect, beforeEach } from 'vitest';
import { MeetingTranscript } from './meeting-transcript.js';

describe('MeetingTranscript', () => {
  let transcript: MeetingTranscript;

  beforeEach(() => {
    transcript = new MeetingTranscript();
  });

  describe('addEntry / getFullText', () => {
    it('should concatenate entries into full text', () => {
      transcript.addEntry('usaremos postgresql');
      transcript.addEntry('maria lo implementa');
      expect(transcript.getFullText()).toBe('usaremos postgresql maria lo implementa');
    });

    it('should return empty string when no entries', () => {
      expect(transcript.getFullText()).toBe('');
    });

    it('should not store empty entries', () => {
      transcript.addEntry('');
      transcript.addEntry('   ');
      expect(transcript.getFullText()).toBe('');
    });
  });

  describe('clear', () => {
    it('should reset entries and entry count', () => {
      transcript.addEntry('decisión importante');
      transcript.clear();
      expect(transcript.getFullText()).toBe('');
      expect(transcript.entryCount).toBe(0);
    });
  });

  describe('getDurationMinutes', () => {
    it('should return 0 for a new transcript', () => {
      expect(transcript.getDurationMinutes()).toBe(0);
    });
  });
});
