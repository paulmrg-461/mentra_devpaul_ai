import { AppSession } from '@mentra/sdk';

export enum AudioState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  INTERRUPTED = 'INTERRUPTED',
}

export class AudioSessionManager {
  private state: AudioState = AudioState.IDLE;
  private currentSpeechAbortController: AbortController | null = null;
  private isBackgroundListeningEnabled = false;
  private transcriptionBuffer = '';
  private readonly BUFFER_FLUSH_INTERVAL_MS = 5000;
  private bufferFlushTimer: NodeJS.Timeout | null = null;
  private activeSpeechPromise: Promise<any> | null = null;

  constructor(private session: AppSession) {}

  /**
   * Initialize background audio listening
   */
  startBackgroundListening() {
    if (this.isBackgroundListeningEnabled) return;

    this.isBackgroundListeningEnabled = true;
    this.state = AudioState.LISTENING;
    console.log('[AUDIO] Background listening enabled');

    this.startBufferFlushTimer();
  }

  /**
   * Stop background audio listening
   */
  stopBackgroundListening() {
    this.isBackgroundListeningEnabled = false;
    this.state = AudioState.IDLE;
    this.clearBufferFlushTimer();
    console.log('[AUDIO] Background listening disabled');
  }

  /**
   * Speak text with ability to interrupt previous speech
   */
  async speak(text: string, interruptible = true): Promise<void> {
    await this.cancelCurrentSpeech();

    if (interruptible) {
      this.currentSpeechAbortController = new AbortController();
    }

    this.state = AudioState.SPEAKING;
    console.log(`[AUDIO] Speaking: "${text.substring(0, 50)}..."`);

    try {
      this.activeSpeechPromise = this.session.audio.speak(text);
      await this.activeSpeechPromise;
      this.state = this.isBackgroundListeningEnabled
        ? AudioState.LISTENING
        : AudioState.IDLE;
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      const errorName = (error as Error).name || '';
      
      // Ignore cancellation errors - they are expected
      const isCancellationError = 
        errorName === 'AbortError' ||
        errorMessage.includes('cancelled') ||
        errorMessage.includes('cleanup');
      
      if (!isCancellationError) {
        console.error('[AUDIO] Speak error:', error);
        this.state = AudioState.IDLE;
      } else {
        console.log('[AUDIO] Speech cancelled (expected during interruption/cleanup)');
        this.state = this.isBackgroundListeningEnabled
          ? AudioState.LISTENING
          : AudioState.IDLE;
      }
    } finally {
      this.currentSpeechAbortController = null;
      this.activeSpeechPromise = null;
    }
  }

  /**
   * Cancel current speech
   */
  async cancelCurrentSpeech(): Promise<void> {
    if (this.currentSpeechAbortController) {
      this.currentSpeechAbortController.abort();
    }
    
    // Wait for active promise to resolve/reject if exists
    if (this.activeSpeechPromise) {
      try {
        await this.activeSpeechPromise;
      } catch (error) {
        // Expected during cancellation
        console.log('[AUDIO] Cancelled active speech promise');
      }
    }
    
    await this.session.audio.cancelAllRequests();
    this.state = AudioState.IDLE;
  }

  /**
   * Add transcription to buffer
   */
  addToTranscriptionBuffer(text: string): void {
    if (!this.isBackgroundListeningEnabled) return;

    this.transcriptionBuffer += ` ${text}`;
    console.log(`[AUDIO] Transcription buffered: "${text}"`);
  }

  /**
   * Get and clear transcription buffer
   */
  flushTranscriptionBuffer(): string {
    const text = this.transcriptionBuffer.trim();
    this.transcriptionBuffer = '';
    return text;
  }

  /**
   * Check if audio is in listening state
   */
  isListening(): boolean {
    return this.state === AudioState.LISTENING;
  }

  /**
   * Check if audio is currently speaking
   */
  isSpeaking(): boolean {
    return this.state === AudioState.SPEAKING;
  }

  /**
   * Get current audio state
   */
  getState(): AudioState {
    return this.state;
  }

  /**
   * Interrupt current speech and return to listening
   */
  async interruptAndListen(): Promise<void> {
    try {
      await this.cancelCurrentSpeech();
      this.state = AudioState.LISTENING;
      console.log('[AUDIO] Interrupted and returned to listening');
    } catch (error) {
      console.error('[AUDIO] Error during interrupt:', error);
      this.state = AudioState.LISTENING; // Ensure we return to listening even on error
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.isBackgroundListeningEnabled = false;
    await this.cancelCurrentSpeech();
    this.clearBufferFlushTimer();
    this.transcriptionBuffer = '';
    this.state = AudioState.IDLE;
  }

  private startBufferFlushTimer(): void {
    this.bufferFlushTimer = setInterval(() => {
      const buffered = this.flushTranscriptionBuffer();
      if (buffered) {
        console.log(`[AUDIO] Auto-flushed buffer: "${buffered.substring(0, 100)}..."`);
      }
    }, this.BUFFER_FLUSH_INTERVAL_MS);
  }

  private clearBufferFlushTimer(): void {
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
      this.bufferFlushTimer = null;
    }
  }
}
