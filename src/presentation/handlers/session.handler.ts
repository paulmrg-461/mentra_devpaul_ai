import { AppSession } from '@mentra/sdk';
import { VoiceAssistantUseCase } from '../../domain/use-cases/voice-assistant.use-case.js';
import { VisionAssistantUseCase } from '../../domain/use-cases/vision-assistant.use-case.js';
import { MeetingAssistantUseCase } from '../../domain/use-cases/meeting-assistant.use-case.js';
import { MeetingTranscript } from '../../domain/entities/meeting-transcript.js';
import { ConversationTurn } from '../../domain/entities/ai.js';
import {
  WAKE_WORDS,
  STOP_COMMANDS,
  VISION_COMMANDS,
  PHOTO_CAPTURE_COMMANDS,
  MEETING_START_COMMANDS,
  MEETING_END_COMMANDS,
  MIN_TRANSCRIPTION_LENGTH,
  FOLLOW_UP_TIMEOUT_MS,
  LISTENING_TIMEOUT_MS,
  PHOTO_READY_TIMEOUT_MS,
  PROCESSING_TIMEOUT_MS,
  NONFINAL_MIN_LENGTH,
  USER_MESSAGES,
} from '../../shared/config/constants.js';
import { AudioSessionManager } from './audio-session.manager.js';

export enum SessionState {
  IDLE,
  LISTENING,
  PROCESSING,
  MEETING,
  PHOTO_READY,
}

const MAX_HISTORY_TURNS = 5;

export class SessionHandler {
  private state: SessionState = SessionState.IDLE;
  private audioManager: AudioSessionManager | null = null;
  private lastCapturedPhoto: string | null = null;
  private followUpTimer: NodeJS.Timeout | null = null;
  private photoReadyTimer: NodeJS.Timeout | null = null;
  private processingWatchdog: NodeJS.Timeout | null = null;
  private currentSession: AppSession | null = null;
  private conversationHistory: ConversationTurn[] = [];
  private continuousMode = false;

  constructor(
    private voiceUseCase: VoiceAssistantUseCase,
    private visionUseCase: VisionAssistantUseCase,
    private meetingUseCase: MeetingAssistantUseCase,
    private meetingTranscript: MeetingTranscript
  ) {}

  setup(session: AppSession) {
    console.log('[SESSION] Initializing Numa Session Handler...');
    this.currentSession = session;
    this.clearAllTimers();
    this.lastCapturedPhoto = null;
    this.transitionTo(SessionState.IDLE, 'setup');

    this.audioManager = new AudioSessionManager(session);
    this.audioManager.startBackgroundListening();

    session.events.onTranscriptionForLanguage('es-ES', async (data) => {
      if (!data.text) return;

      const lowerText = data.text.toLowerCase();
      if (lowerText.trim().length < MIN_TRANSCRIPTION_LENGTH) return;

      const isFinal = (data as any).isFinal === true;
      console.log(`[DEBUG] "${data.text}" | isFinal:${isFinal} | state:${SessionState[this.state]}`);

      if (this.audioManager?.isListening()) {
        this.audioManager.addToTranscriptionBuffer(lowerText);
      }

      try {
        await this.routeTranscription(session, lowerText, isFinal);
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('cancelled') || msg.includes('cleanup')) return;
        console.error('[SESSION] Unhandled state error:', err);
        this.recoverToIdle(session, 'unhandled error');
      }
    });

    session.events.onButtonPress((data) => {
      if (data.buttonId === 'right' && data.pressType === 'short') {
        this.handleManualTrigger(session);
      }
    });

    session.events.onTouchEvent('double_tap', async () => {
      await this.handleDoubleTap(session);
    });

    session.events.onCustomMessage('webview_action', async (payload: any) => {
      console.log('[SESSION] Webview action:', payload);
      if (payload.action === 'talk') {
        this.handleManualTrigger(session);
      } else if (payload.action === 'photo') {
        await this.handleDoubleTap(session);
      } else if (payload.action === 'meeting') {
        if (this.state === SessionState.MEETING) {
          await this.endMeeting(session);
        } else {
          await this.startMeeting(session);
        }
      } else if (payload.action === 'continuous') {
        this.toggleContinuousMode(session);
      } else if (payload.action === 'stop') {
        await this.handleStop(session);
      }
    });
  }

  // ─── Transcription router ───────────────────────────────────────────────────

  private async routeTranscription(
    session: AppSession,
    lowerText: string,
    isFinal: boolean
  ): Promise<void> {
    switch (this.state) {
      case SessionState.IDLE:
        if (!isFinal) {
          if (this.continuousMode && lowerText.trim().length >= NONFINAL_MIN_LENGTH) {
            await this.handleIdleState(session, lowerText);
          }
          return;
        }
        if (this.state === SessionState.IDLE) await this.handleIdleState(session, lowerText);
        return;

      case SessionState.LISTENING:
        if (!isFinal) {
          if (lowerText.trim().length >= NONFINAL_MIN_LENGTH) {
            await this.handleListeningState(session, lowerText);
          }
          return;
        }
        if (this.state === SessionState.LISTENING) await this.handleListeningState(session, lowerText);
        return;

      case SessionState.PHOTO_READY:
        if (!isFinal) return;
        await this.handlePhotoReadyState(session, lowerText);
        return;

      case SessionState.MEETING:
        await this.handleMeetingState(session, lowerText, isFinal);
        return;

      case SessionState.PROCESSING:
        if (isFinal && this.isStopCommand(lowerText)) {
          await this.handleStop(session);
        }
        return;
    }
  }

  // ─── State handlers ─────────────────────────────────────────────────────────

  private async handleIdleState(session: AppSession, lowerText: string): Promise<void> {
    const hasWakeWord = this.detectWakeWord(lowerText);

    if (!hasWakeWord && !this.continuousMode) return;

    const commandPart = hasWakeWord
      ? this.extractCommandAfterWakeWord(lowerText)
      : lowerText;

    if (hasWakeWord) console.log('[STATE] Wake word detected.');

    if (commandPart && commandPart.length > MIN_TRANSCRIPTION_LENGTH) {
      if (this.isMeetingStartCommand(commandPart)) {
        await this.startMeeting(session);
        return;
      }
      console.log(`[STATE] Immediate command: "${commandPart}"`);
      await this.beginProcessing(session, commandPart);
      return;
    }

    if (!this.continuousMode) {
      console.log('[STATE] Switching to LISTENING.');
      await this.transitionToListening(session);
    }
  }

  private async handleListeningState(session: AppSession, lowerText: string): Promise<void> {
    this.clearFollowUpTimer();
    console.log(`[STATE] Command in LISTENING: "${lowerText}"`);
    await this.beginProcessing(session, lowerText);
  }

  private async handlePhotoReadyState(session: AppSession, lowerText: string): Promise<void> {
    if (!this.detectWakeWord(lowerText)) {
      await this.processPhotoReadyCommand(session, lowerText);
      return;
    }

    const commandPart = this.extractCommandAfterWakeWord(lowerText) ?? '';

    if (commandPart.length === 0) {
      // Lone wake word — ignore, keep photo context alive
      console.log('[PHOTO] Lone wake word ignored, keeping photo context.');
      return;
    }

    if (this.isStopCommand(commandPart)) {
      this.lastCapturedPhoto = null;
      await this.handleStop(session);
      return;
    }

    await this.processPhotoReadyCommand(session, commandPart);
  }

  private async processPhotoReadyCommand(session: AppSession, commandPart: string): Promise<void> {
    if (this.isStopCommand(commandPart)) {
      this.lastCapturedPhoto = null;
      await this.handleStop(session);
      return;
    }

    this.clearPhotoReadyTimer();
    this.transitionTo(SessionState.PROCESSING, 'photo question');
    this.startProcessingWatchdog(session);

    try {
      if (this.isPhotoCaptureCommand(commandPart)) {
        const inlineQuestion = this.extractQuestionAfterCapture(commandPart);
        if (inlineQuestion) {
          await this.handleVisionRequest(session, inlineQuestion);
        } else {
          await this.handlePhotoCaptureOnly(session);
        }
      } else {
        await this.handlePhotoQuestion(session, commandPart);
      }
    } finally {
      this.clearProcessingWatchdog();
      // Stay in PHOTO_READY for follow-ups unless handler already moved us
      if (this.state === SessionState.PROCESSING) {
        this.startPhotoReadyListening(session);
      }
    }
  }

  private async handleMeetingState(
    session: AppSession,
    lowerText: string,
    isFinal: boolean
  ): Promise<void> {
    if (isFinal) {
      this.meetingTranscript.addEntry(lowerText);
    } else {
      return;
    }

    if (!this.detectWakeWord(lowerText)) return;

    const commandPart = this.extractCommandAfterWakeWord(lowerText) ?? '';

    if (this.isMeetingEndCommand(commandPart)) {
      await this.endMeeting(session);
      return;
    }

    if (this.isStopCommand(commandPart)) {
      await this.audioManager?.cancelCurrentSpeech();
      this.showText(session, USER_MESSAGES.meetingReady);
      return;
    }

    if (commandPart.length > MIN_TRANSCRIPTION_LENGTH) {
      await this.handleMeetingQuery(session, commandPart);
    }
  }

  // ─── Core processing pipeline ───────────────────────────────────────────────

  private async beginProcessing(session: AppSession, text: string): Promise<void> {
    this.transitionTo(SessionState.PROCESSING, `command "${text}"`);
    this.startProcessingWatchdog(session);

    try {
      await this.dispatchCommand(session, text);
    } catch (err) {
      console.error('[ERROR] beginProcessing:', err);
      this.recoverToIdle(session, 'dispatch error');
    } finally {
      this.clearProcessingWatchdog();
    }
  }

  private async dispatchCommand(session: AppSession, text: string): Promise<void> {
    if (this.isStopCommand(text)) {
      await this.handleStop(session);
      return;
    }

    if (this.isPhotoCaptureCommand(text)) {
      const inlineQuestion = this.extractQuestionAfterCapture(text);
      if (inlineQuestion) {
        await this.handleVisionRequest(session, inlineQuestion);
        this.startPhotoReadyListening(session);
      } else {
        await this.handlePhotoCaptureOnly(session);
      }
      return;
    }

    if (this.isVisionCommand(text)) {
      await this.handleVisionRequest(session);
      this.startPhotoReadyListening(session);
      return;
    }

    await this.handleVoiceRequest(session, text);
    this.startFollowUpListening(session);
  }

  // ─── Meeting helpers ─────────────────────────────────────────────────────────

  private async handleMeetingQuery(session: AppSession, question: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      const response = await this.meetingUseCase.queryContext(
        question,
        this.meetingTranscript,
        (msg) => this.showText(session, msg)
      );
      this.showText(session, response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('[MEETING] Query error:', error);
      this.showText(session, USER_MESSAGES.meetingError);
      await this.audioManager?.speak(USER_MESSAGES.meetingError, false);
    }
  }

  private async endMeeting(session: AppSession): Promise<void> {
    console.log('[STATE] Ending meeting...');
    this.transitionTo(SessionState.PROCESSING, 'end meeting');
    this.startProcessingWatchdog(session);
    try {
      await this.audioManager?.cancelCurrentSpeech();
      this.showText(session, USER_MESSAGES.meetingEnded);
      await this.audioManager?.speak(USER_MESSAGES.meetingEnded, false);

      const summary = await this.meetingUseCase.generateSummary(
        this.meetingTranscript,
        (msg) => this.showText(session, msg)
      );
      this.showText(session, summary);
      await this.audioManager?.speak(summary, true);
    } catch (error) {
      console.error('[MEETING] Summary error:', error);
      this.showText(session, USER_MESSAGES.meetingError);
      await this.audioManager?.speak(USER_MESSAGES.meetingError, false);
    } finally {
      this.clearProcessingWatchdog();
      this.meetingTranscript.clear();
      this.transitionTo(SessionState.IDLE, 'meeting ended');
    }
  }

  private async startMeeting(session: AppSession): Promise<void> {
    this.meetingTranscript.clear();
    this.transitionTo(SessionState.MEETING, 'meeting started');
    this.showText(session, USER_MESSAGES.meetingStarted);
    await this.audioManager?.speak(USER_MESSAGES.meetingStarted, false);
  }

  // ─── Vision / Photo helpers ──────────────────────────────────────────────────

  async handleVisionRequest(session: AppSession, question?: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      this.showText(session, USER_MESSAGES.capturing);

      const photo = await session.camera.requestPhoto({ size: 'medium', saveToGallery: false });

      if (!photo || !photo.buffer) {
        this.showText(session, USER_MESSAGES.photoError);
        await this.audioManager?.speak(USER_MESSAGES.photoError, false);
        return;
      }

      this.lastCapturedPhoto = photo.buffer.toString('base64');

      const response = await this.visionUseCase.execute(
        this.lastCapturedPhoto,
        (msg) => this.showText(session, msg),
        question
      );

      this.showText(session, response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('[VISION] Error:', error);
      this.showText(session, USER_MESSAGES.visionError);
      await this.audioManager?.speak(USER_MESSAGES.visionError, false);
    }
  }

  private async handlePhotoCaptureOnly(session: AppSession): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      this.showText(session, USER_MESSAGES.capturing);

      const photo = await session.camera.requestPhoto({ size: 'medium', saveToGallery: false });

      if (!photo || !photo.buffer) {
        this.showText(session, USER_MESSAGES.photoError);
        await this.audioManager?.speak(USER_MESSAGES.photoError, false);
        this.transitionTo(SessionState.IDLE, 'photo capture failed');
        return;
      }

      this.lastCapturedPhoto = photo.buffer.toString('base64');
      this.showText(session, USER_MESSAGES.photoReady);
      await this.audioManager?.speak(USER_MESSAGES.photoReady, false);

      this.startPhotoReadyListening(session);
    } catch (error) {
      console.error('[PHOTO] Capture error:', error);
      this.showText(session, USER_MESSAGES.photoError);
      await this.audioManager?.speak(USER_MESSAGES.photoError, false);
      this.transitionTo(SessionState.IDLE, 'photo capture exception');
    }
  }

  private async handlePhotoQuestion(session: AppSession, question: string): Promise<void> {
    if (!this.lastCapturedPhoto) {
      console.warn('[PHOTO] Question received without stored photo. Recapturing.');
      await this.handleVisionRequest(session, question);
      return;
    }

    try {
      await this.audioManager?.cancelCurrentSpeech();

      const response = await this.visionUseCase.execute(
        this.lastCapturedPhoto,
        (msg) => this.showText(session, msg),
        question
      );

      this.showText(session, response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('[PHOTO] Question error:', error);
      this.showText(session, USER_MESSAGES.visionError);
      await this.audioManager?.speak(USER_MESSAGES.visionError, false);
    }
  }

  // ─── Voice helper ────────────────────────────────────────────────────────────

  async handleVoiceRequest(session: AppSession, text: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();

      let fullResponse = '';
      fullResponse = await this.voiceUseCase.executeStreaming(
        text,
        (msg) => this.showText(session, msg),
        async (sentence) => {
          this.showText(session, sentence);
          await this.audioManager?.speak(sentence, true);
        },
        this.conversationHistory
      );

      this.showText(session, fullResponse);
      this.addToHistory(text, fullResponse);
    } catch (error) {
      const msg = (error as Error).message || '';
      if (msg.includes('cancelled') || msg.includes('cleanup')) return;
      console.error('[VOICE] Error:', error);
      this.showText(session, USER_MESSAGES.voiceError);
      await this.audioManager?.speak(USER_MESSAGES.voiceError, false);
    }
  }

  // ─── Session control ─────────────────────────────────────────────────────────

  async handleStop(session: AppSession): Promise<void> {
    console.log('[STATE] Stop requested.');
    this.clearAllTimers();
    this.lastCapturedPhoto = null;
    this.conversationHistory = [];
    this.transitionTo(SessionState.IDLE, 'stop command');

    try {
      await this.audioManager?.cancelCurrentSpeech();
      this.audioManager?.startBackgroundListening();

      this.showText(session, USER_MESSAGES.stopped);
      setTimeout(() => {
        if (this.state === SessionState.IDLE) {
          this.showText(session, USER_MESSAGES.ready);
        }
      }, 1500);
    } catch (error) {
      console.error('[STATE] Error during stop:', error);
    }
  }

  private handleManualTrigger(session: AppSession): void {
    if (this.state === SessionState.PROCESSING) {
      console.log('[STATE] Manual trigger ignored during PROCESSING.');
      return;
    }
    this.clearFollowUpTimer();
    this.clearPhotoReadyTimer();
    this.transitionTo(SessionState.LISTENING, 'manual trigger');
    this.showText(session, USER_MESSAGES.listening);
  }

  async handleButtonPress(session: AppSession): Promise<void> {
    this.handleManualTrigger(session);
  }

  async handleDoubleTap(session: AppSession): Promise<void> {
    if (this.state === SessionState.PROCESSING) {
      console.log('[STATE] Double tap ignored during PROCESSING.');
      return;
    }
    console.log('[STATE] Double tap: capture + describe.');
    this.clearAllTimers();
    this.transitionTo(SessionState.PROCESSING, 'double tap');
    this.startProcessingWatchdog(session);
    try {
      await this.handleVisionRequest(session);
      this.startPhotoReadyListening(session);
    } finally {
      this.clearProcessingWatchdog();
    }
  }

  // ─── History & mode helpers ───────────────────────────────────────────────────

  private addToHistory(userText: string, assistantText: string): void {
    this.conversationHistory.push({ role: 'user', content: userText });
    this.conversationHistory.push({ role: 'assistant', content: assistantText });
    if (this.conversationHistory.length > MAX_HISTORY_TURNS * 2) {
      this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
    }
  }

  private toggleContinuousMode(session: AppSession): void {
    this.continuousMode = !this.continuousMode;
    const msg = this.continuousMode ? USER_MESSAGES.continuousOn : USER_MESSAGES.continuousOff;
    console.log(`[MODE] Continuous mode: ${this.continuousMode}`);
    this.showText(session, msg);
    this.audioManager?.speak(msg, false);
    if (this.continuousMode && this.state === SessionState.IDLE) {
      this.transitionTo(SessionState.LISTENING, 'continuous mode on');
    }
  }

  // ─── Safe layout helper ───────────────────────────────────────────────────────

  private showText(session: AppSession, msg: string): void {
    try {
      session.layouts.showTextWall(msg);
    } catch {
      // WebSocket closed — phone screen locked or session ended
    }
  }

  // ─── Transitions ─────────────────────────────────────────────────────────────

  private transitionTo(next: SessionState, reason: string): void {
    if (this.state === next) return;
    console.log(`[STATE] ${SessionState[this.state]} → ${SessionState[next]} (${reason})`);
    this.state = next;
  }

  private async transitionToListening(session: AppSession): Promise<void> {
    this.transitionTo(SessionState.LISTENING, 'wake word alone');
    this.showText(session, USER_MESSAGES.idle);
    void this.audioManager?.speak(USER_MESSAGES.idle, false);

    this.followUpTimer = setTimeout(() => {
      if (this.state === SessionState.LISTENING) {
        this.transitionTo(SessionState.IDLE, 'listening timeout');
        this.showText(session, USER_MESSAGES.ready);
      }
    }, LISTENING_TIMEOUT_MS);
  }

  private startFollowUpListening(session: AppSession): void {
    this.clearFollowUpTimer();
    this.transitionTo(SessionState.LISTENING, 'follow-up window');
    this.showText(session, USER_MESSAGES.followUpListening);

    if (this.continuousMode) return; // stay in LISTENING indefinitely

    this.followUpTimer = setTimeout(() => {
      if (this.state === SessionState.LISTENING) {
        this.transitionTo(SessionState.IDLE, 'follow-up expired');
        this.conversationHistory = [];
        this.showText(session, USER_MESSAGES.ready);
      }
    }, FOLLOW_UP_TIMEOUT_MS);
  }

  private startPhotoReadyListening(session: AppSession): void {
    this.clearPhotoReadyTimer();
    this.transitionTo(SessionState.PHOTO_READY, 'photo context active');
    this.showText(session, USER_MESSAGES.photoContextActive);

    this.photoReadyTimer = setTimeout(() => {
      if (this.state === SessionState.PHOTO_READY) {
        this.lastCapturedPhoto = null;
        this.transitionTo(SessionState.IDLE, 'photo context expired');
        this.showText(session, USER_MESSAGES.ready);
      }
    }, PHOTO_READY_TIMEOUT_MS);
  }

  // ─── Watchdog & recovery ─────────────────────────────────────────────────────

  private startProcessingWatchdog(session: AppSession): void {
    this.clearProcessingWatchdog();
    this.processingWatchdog = setTimeout(() => {
      if (this.state === SessionState.PROCESSING) {
        console.error('[WATCHDOG] PROCESSING stuck. Forcing recovery.');
        this.recoverToIdle(session, 'processing watchdog');
      }
    }, PROCESSING_TIMEOUT_MS);
  }

  private recoverToIdle(session: AppSession, reason: string): void {
    this.clearAllTimers();
    this.transitionTo(SessionState.IDLE, reason);
    try {
      this.audioManager?.cancelCurrentSpeech();
      this.audioManager?.startBackgroundListening();
      this.showText(session, USER_MESSAGES.ready);
    } catch (err) {
      console.error('[STATE] Error in recoverToIdle:', err);
    }
  }

  // ─── Timers ──────────────────────────────────────────────────────────────────

  private clearAllTimers(): void {
    this.clearFollowUpTimer();
    this.clearPhotoReadyTimer();
    this.clearProcessingWatchdog();
  }

  private clearFollowUpTimer(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
  }

  private clearPhotoReadyTimer(): void {
    if (this.photoReadyTimer) {
      clearTimeout(this.photoReadyTimer);
      this.photoReadyTimer = null;
    }
  }

  private clearProcessingWatchdog(): void {
    if (this.processingWatchdog) {
      clearTimeout(this.processingWatchdog);
      this.processingWatchdog = null;
    }
  }

  // ─── Command detection ────────────────────────────────────────────────────────

  private detectWakeWord(text: string): string | null {
    return WAKE_WORDS.find(w => text.includes(w)) ?? null;
  }

  private extractCommandAfterWakeWord(text: string): string | undefined {
    const detected = this.detectWakeWord(text);
    if (!detected) return undefined;
    return text.split(detected)[1]?.trim();
  }

  private isStopCommand(text: string): boolean {
    return STOP_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isVisionCommand(text: string): boolean {
    return VISION_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isPhotoCaptureCommand(text: string): boolean {
    return PHOTO_CAPTURE_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isMeetingStartCommand(text: string): boolean {
    return MEETING_START_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isMeetingEndCommand(text: string): boolean {
    return MEETING_END_COMMANDS.some(cmd => text.includes(cmd));
  }

  private extractQuestionAfterCapture(text: string): string | undefined {
    const captureCmd = PHOTO_CAPTURE_COMMANDS.find(cmd => text.includes(cmd));
    if (!captureCmd) return undefined;

    const after = text.split(captureCmd)[1]?.trim();
    if (!after) return undefined;

    const cleaned = after.replace(/^(y\s+dime\s+|y\s+|para\s+ver\s+|,\s*)/, '').trim();
    return cleaned.length > MIN_TRANSCRIPTION_LENGTH ? cleaned : undefined;
  }
}
