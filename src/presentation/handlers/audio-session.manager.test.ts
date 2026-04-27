import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioSessionManager, AudioState } from './audio-session.manager.js';

// Mock AppSession
const createMockSession = () => ({
  audio: {
    speak: vi.fn().mockResolvedValue(undefined),
    cancelAllRequests: vi.fn().mockResolvedValue(undefined),
  },
});

describe('AudioSessionManager', () => {
  let mockSession: any;
  let audioManager: AudioSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSession = createMockSession();
    audioManager = new AudioSessionManager(mockSession);
  });

  describe('Initialization', () => {
    it('should start in IDLE state', () => {
      expect(audioManager.getState()).toBe(AudioState.IDLE);
      expect(audioManager.isListening()).toBe(false);
      expect(audioManager.isSpeaking()).toBe(false);
    });
  });

  describe('Background Listening', () => {
    it('should enable background listening', () => {
      audioManager.startBackgroundListening();
      
      expect(audioManager.getState()).toBe(AudioState.LISTENING);
      expect(audioManager.isListening()).toBe(true);
    });

    it('should not create multiple listeners if already enabled', () => {
      audioManager.startBackgroundListening();
      audioManager.startBackgroundListening();
      audioManager.startBackgroundListening();
      
      expect(audioManager.getState()).toBe(AudioState.LISTENING);
    });

    it('should stop background listening', () => {
      audioManager.startBackgroundListening();
      audioManager.stopBackgroundListening();
      
      expect(audioManager.getState()).toBe(AudioState.IDLE);
      expect(audioManager.isListening()).toBe(false);
    });
  });

  describe('Speech Management', () => {
    it('should speak text', async () => {
      await audioManager.speak('Hello world');
      
      expect(mockSession.audio.speak).toHaveBeenCalledWith('Hello world');
    });

    it('should cancel current speech before starting new one', async () => {
      await audioManager.speak('First message');
      await audioManager.speak('Second message');
      
      expect(mockSession.audio.cancelAllRequests).toHaveBeenCalledTimes(2);
      expect(mockSession.audio.speak).toHaveBeenLastCalledWith('Second message');
    });

    it('should cancel speech when abort controller is triggered', async () => {
      const speakPromise = audioManager.speak('Long message');
      
      await audioManager.cancelCurrentSpeech();
      
      expect(mockSession.audio.cancelAllRequests).toHaveBeenCalled();
    });

    it('should return to listening state after speaking (if background enabled)', async () => {
      audioManager.startBackgroundListening();
      await audioManager.speak('Response');
      
      expect(audioManager.getState()).toBe(AudioState.LISTENING);
    });

    it('should return to IDLE state after speaking (if background disabled)', async () => {
      await audioManager.speak('Response');
      
      expect(audioManager.getState()).toBe(AudioState.IDLE);
    });
  });

  describe('Transcription Buffer', () => {
    it('should add text to buffer', () => {
      audioManager.startBackgroundListening();
      
      audioManager.addToTranscriptionBuffer('Hello');
      audioManager.addToTranscriptionBuffer('World');
      
      const flushed = audioManager.flushTranscriptionBuffer();
      expect(flushed).toBe('Hello World');
    });

    it('should clear buffer after flush', () => {
      audioManager.addToTranscriptionBuffer('Test');
      audioManager.flushTranscriptionBuffer();
      
      const secondFlush = audioManager.flushTranscriptionBuffer();
      expect(secondFlush).toBe('');
    });

    it('should not buffer when background listening disabled', () => {
      audioManager.addToTranscriptionBuffer('Should not buffer');
      
      const flushed = audioManager.flushTranscriptionBuffer();
      expect(flushed).toBe('');
    });

    it('should auto-flush buffer after interval', () => {
      audioManager.startBackgroundListening();
      audioManager.addToTranscriptionBuffer('Auto flush test');
      
      // Advance timer by 5 seconds (BUFFER_FLUSH_INTERVAL_MS)
      vi.advanceTimersByTime(5000);
      
      const flushed = audioManager.flushTranscriptionBuffer();
      expect(flushed).toBe('');
    });
  });

  describe('Interrupt and Listen', () => {
    it('should cancel speech and return to listening', async () => {
      audioManager.startBackgroundListening();
      await audioManager.speak('Interrupt me');
      
      await audioManager.interruptAndListen();
      
      expect(mockSession.audio.cancelAllRequests).toHaveBeenCalled();
      expect(audioManager.getState()).toBe(AudioState.LISTENING);
    });
  });

  describe('Cleanup', () => {
    it('should dispose all resources', async () => {
      audioManager.startBackgroundListening();
      await audioManager.dispose();
      
      expect(audioManager.isListening()).toBe(false);
      expect(audioManager.isSpeaking()).toBe(false);
      expect(audioManager.getState()).toBe(AudioState.IDLE);
    });
  });
});
