import { AppSession } from '@mentra/sdk';
import { VoiceAssistantUseCase } from '../../domain/use-cases/voice-assistant.use-case.js';
import { VisionAssistantUseCase } from '../../domain/use-cases/vision-assistant.use-case.js';
import { MeetingAssistantUseCase } from '../../domain/use-cases/meeting-assistant.use-case.js';
import { MeetingTranscript } from '../../domain/entities/meeting-transcript.js';
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

export class SessionHandler {
  private state: SessionState = SessionState.IDLE;
  private audioManager: AudioSessionManager | null = null;
  private lastCapturedPhoto: string | null = null;
  private followUpTimer: NodeJS.Timeout | null = null;
  private photoReadyTimer: NodeJS.Timeout | null = null;

  constructor(
    private voiceUseCase: VoiceAssistantUseCase,
    private visionUseCase: VisionAssistantUseCase,
    private meetingUseCase: MeetingAssistantUseCase,
    private meetingTranscript: MeetingTranscript
  ) {}

  setup(session: AppSession) {
    console.log('Initializing DevPaul Session Handler...');
    this.clearFollowUpTimer();
    this.clearPhotoReadyTimer();
    this.state = SessionState.IDLE;
    this.lastCapturedPhoto = null;

    this.audioManager = new AudioSessionManager(session);
    this.audioManager.startBackgroundListening();

    session.events.onTranscriptionForLanguage('es-ES', async (data) => {
      if (!data.text) return;

      const lowerText = data.text.toLowerCase();
      if (lowerText.trim().length < MIN_TRANSCRIPTION_LENGTH) return;

      console.log(`[DEBUG] "${data.text}" | isFinal:${data.isFinal} | state:${SessionState[this.state]}`);

      if (this.audioManager?.isListening()) {
        this.audioManager.addToTranscriptionBuffer(lowerText);
      }

      try {
        switch (this.state) {
          case SessionState.IDLE:
            await this.handleIdleState(session, lowerText);
            break;

          case SessionState.LISTENING:
            if ((data as any).isFinal === false) return;
            this.clearFollowUpTimer();
            console.log(`[STATE] Command in LISTENING: "${data.text}"`);
            this.state = SessionState.PROCESSING;
            await this.processCommand(session, lowerText);
            break;

          case SessionState.PHOTO_READY:
            await this.handlePhotoReadyState(session, lowerText, data);
            break;

          case SessionState.PROCESSING:
            if ((data as any).isFinal && this.isStopCommand(lowerText)) {
              await this.handleStop(session);
            }
            break;

          case SessionState.MEETING:
            await this.handleMeetingState(session, lowerText, data);
            break;
        }
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('cancelled') || msg.includes('cleanup')) return;
        console.error('[SESSION] Unhandled state error:', err);
        this.state = SessionState.IDLE;
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
      console.log('Webview action received:', payload);
      if (payload.action === 'talk') {
        this.handleManualTrigger(session);
      } else if (payload.action === 'photo') {
        await this.handleDoubleTap(session);
      } else if (payload.action === 'stop') {
        await this.handleStop(session);
      }
    });
  }

  // ─── Core command routing ───────────────────────────────────────────────────

  private async processCommand(session: AppSession, text: string): Promise<void> {
    try {
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
    } catch (err) {
      console.error('[ERROR] processCommand:', err);
      this.state = SessionState.IDLE;
    }
  }

  // ─── State handlers ─────────────────────────────────────────────────────────

  private async handleIdleState(session: AppSession, lowerText: string): Promise<void> {
    if (!this.detectWakeWord(lowerText)) return;
    console.log(`[STATE] Wake word detected.`);

    const commandPart = this.extractCommandAfterWakeWord(lowerText);

    if (commandPart && commandPart.length > MIN_TRANSCRIPTION_LENGTH) {
      if (this.isMeetingStartCommand(commandPart)) {
        await this.startMeeting(session);
        return;
      }
      console.log(`[STATE] Immediate command: "${commandPart}"`);
      this.state = SessionState.PROCESSING;
      await this.processCommand(session, commandPart);
      return;
    }

    console.log('[STATE] Switching to LISTENING.');
    this.state = SessionState.LISTENING;
    await this.transitionToListening(session);
  }

  private async handlePhotoReadyState(
    session: AppSession,
    lowerText: string,
    data: any
  ): Promise<void> {
    if ((data as any).isFinal === false) return;

    this.clearPhotoReadyTimer();
    const commandPart = this.detectWakeWord(lowerText)
      ? (this.extractCommandAfterWakeWord(lowerText) ?? '')
      : lowerText;

    if (this.isStopCommand(commandPart) || commandPart.length === 0) {
      this.lastCapturedPhoto = null;
      await this.handleStop(session);
      return;
    }

    this.state = SessionState.PROCESSING;

    if (this.isPhotoCaptureCommand(commandPart)) {
      const inlineQuestion = this.extractQuestionAfterCapture(commandPart);
      if (inlineQuestion) {
        await this.handleVisionRequest(session, inlineQuestion);
      } else {
        await this.handlePhotoCaptureOnly(session);
        return;
      }
    } else {
      // question about stored photo
      await this.handlePhotoQuestion(session, commandPart);
    }

    this.startPhotoReadyListening(session);
  }

  private async handleMeetingState(
    session: AppSession,
    lowerText: string,
    data: any
  ): Promise<void> {
    if ((data as any).isFinal !== false) {
      this.meetingTranscript.addEntry(lowerText);
    }

    if ((data as any).isFinal === false) return;
    if (!this.detectWakeWord(lowerText)) return;

    const commandPart = this.extractCommandAfterWakeWord(lowerText) ?? '';

    if (this.isMeetingEndCommand(commandPart)) {
      await this.endMeeting(session);
      return;
    }

    if (this.isStopCommand(commandPart)) {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.meetingReady);
      return;
    }

    if (commandPart.length > MIN_TRANSCRIPTION_LENGTH) {
      await this.handleMeetingQuery(session, commandPart);
    }
  }

  // ─── Meeting helpers ─────────────────────────────────────────────────────────

  private async handleMeetingQuery(session: AppSession, question: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      const response = await this.meetingUseCase.queryContext(
        question,
        this.meetingTranscript,
        (msg) => session.layouts.showTextWall(msg)
      );
      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('[MEETING] Query error:', error);
      session.layouts.showTextWall(USER_MESSAGES.meetingError);
      await this.audioManager?.speak(USER_MESSAGES.meetingError, false);
    }
  }

  private async endMeeting(session: AppSession): Promise<void> {
    console.log('[STATE] Ending meeting...');
    this.state = SessionState.PROCESSING;
    try {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.meetingEnded);
      await this.audioManager?.speak(USER_MESSAGES.meetingEnded, false);

      const summary = await this.meetingUseCase.generateSummary(
        this.meetingTranscript,
        (msg) => session.layouts.showTextWall(msg)
      );
      session.layouts.showTextWall(summary);
      await this.audioManager?.speak(summary, true);
    } catch (error) {
      console.error('[MEETING] Summary error:', error);
      session.layouts.showTextWall(USER_MESSAGES.meetingError);
      await this.audioManager?.speak(USER_MESSAGES.meetingError, false);
    } finally {
      this.meetingTranscript.clear();
      this.state = SessionState.IDLE;
    }
  }

  private async startMeeting(session: AppSession): Promise<void> {
    this.meetingTranscript.clear();
    this.state = SessionState.MEETING;
    session.layouts.showTextWall(USER_MESSAGES.meetingStarted);
    await this.audioManager?.speak(USER_MESSAGES.meetingStarted, false);
  }

  // ─── Vision / Photo helpers ──────────────────────────────────────────────────

  async handleVisionRequest(session: AppSession, question?: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.capturing);

      const photo = await session.camera.requestPhoto({ size: 'medium', saveToGallery: false });

      if (!photo || !photo.buffer) {
        session.layouts.showTextWall(USER_MESSAGES.photoError);
        await this.audioManager?.speak(USER_MESSAGES.photoError, false);
        return;
      }

      this.lastCapturedPhoto = photo.buffer.toString('base64');

      const response = await this.visionUseCase.execute(
        this.lastCapturedPhoto,
        (msg) => session.layouts.showTextWall(msg),
        question
      );

      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('Vision Assistant Error:', error);
      session.layouts.showTextWall(USER_MESSAGES.visionError);
      await this.audioManager?.speak(USER_MESSAGES.visionError, false);
    }
  }

  private async handlePhotoCaptureOnly(session: AppSession): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.capturing);

      const photo = await session.camera.requestPhoto({ size: 'medium', saveToGallery: false });

      if (!photo || !photo.buffer) {
        session.layouts.showTextWall(USER_MESSAGES.photoError);
        await this.audioManager?.speak(USER_MESSAGES.photoError, false);
        this.state = SessionState.IDLE;
        return;
      }

      this.lastCapturedPhoto = photo.buffer.toString('base64');
      session.layouts.showTextWall(USER_MESSAGES.photoReady);
      await this.audioManager?.speak(USER_MESSAGES.photoReady, false);

      this.startPhotoReadyListening(session);
    } catch (error) {
      console.error('Photo capture error:', error);
      session.layouts.showTextWall(USER_MESSAGES.photoError);
      await this.audioManager?.speak(USER_MESSAGES.photoError, false);
      this.state = SessionState.IDLE;
    }
  }

  private async handlePhotoQuestion(session: AppSession, question: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();

      const response = await this.visionUseCase.execute(
        this.lastCapturedPhoto!,
        (msg) => session.layouts.showTextWall(msg),
        question
      );

      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('[PHOTO] Question error:', error);
      session.layouts.showTextWall(USER_MESSAGES.visionError);
      await this.audioManager?.speak(USER_MESSAGES.visionError, false);
    }
  }

  // ─── Voice helper ────────────────────────────────────────────────────────────

  async handleVoiceRequest(session: AppSession, text: string): Promise<void> {
    try {
      await this.audioManager?.cancelCurrentSpeech();

      const response = await this.voiceUseCase.execute(text, (msg) => {
        session.layouts.showTextWall(msg);
      });

      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('Voice Assistant Error:', error);
      session.layouts.showTextWall(USER_MESSAGES.voiceError);
      await this.audioManager?.speak(USER_MESSAGES.voiceError, false);
    }
  }

  // ─── Session control ─────────────────────────────────────────────────────────

  async handleStop(session: AppSession): Promise<void> {
    console.log('Stop command received.');
    this.clearFollowUpTimer();
    this.clearPhotoReadyTimer();
    this.lastCapturedPhoto = null;
    this.state = SessionState.IDLE;

    try {
      await this.audioManager?.cancelCurrentSpeech();
      this.audioManager?.startBackgroundListening();

      session.layouts.showTextWall(USER_MESSAGES.stopped);
      setTimeout(() => {
        session.layouts.showTextWall(USER_MESSAGES.ready);
      }, 1500);
    } catch (error) {
      console.error('Error handling stop:', error);
    }
  }

  private handleManualTrigger(session: AppSession): void {
    if (this.state === SessionState.PROCESSING) return;
    this.clearFollowUpTimer();
    this.state = SessionState.LISTENING;
    session.layouts.showTextWall(USER_MESSAGES.listening);
  }

  async handleButtonPress(session: AppSession): Promise<void> {
    this.handleManualTrigger(session);
  }

  async handleDoubleTap(session: AppSession): Promise<void> {
    if (this.state === SessionState.PROCESSING) return;
    console.log('Double tap: capture + describe.');
    this.clearFollowUpTimer();
    this.clearPhotoReadyTimer();
    this.state = SessionState.PROCESSING;
    await this.handleVisionRequest(session);
    this.startPhotoReadyListening(session);
  }

  // ─── Transitions ─────────────────────────────────────────────────────────────

  private async transitionToListening(session: AppSession): Promise<void> {
    session.layouts.showTextWall(USER_MESSAGES.idle);
    await this.audioManager?.speak(USER_MESSAGES.idle, false);

    this.followUpTimer = setTimeout(() => {
      if (this.state === SessionState.LISTENING) {
        this.state = SessionState.IDLE;
        session.layouts.showTextWall(USER_MESSAGES.ready);
        console.log('[STATE] Listening timeout → IDLE.');
      }
    }, LISTENING_TIMEOUT_MS);
  }

  private startFollowUpListening(session: AppSession): void {
    this.state = SessionState.LISTENING;
    session.layouts.showTextWall(USER_MESSAGES.followUpListening);

    this.followUpTimer = setTimeout(() => {
      if (this.state === SessionState.LISTENING) {
        this.state = SessionState.IDLE;
        session.layouts.showTextWall(USER_MESSAGES.ready);
        console.log('[STATE] Follow-up window expired → IDLE.');
      }
    }, FOLLOW_UP_TIMEOUT_MS);
  }

  private startPhotoReadyListening(session: AppSession): void {
    this.state = SessionState.PHOTO_READY;
    session.layouts.showTextWall(USER_MESSAGES.photoContextActive);

    this.photoReadyTimer = setTimeout(() => {
      if (this.state === SessionState.PHOTO_READY) {
        this.lastCapturedPhoto = null;
        this.state = SessionState.IDLE;
        session.layouts.showTextWall(USER_MESSAGES.ready);
        console.log('[STATE] Photo context expired → IDLE.');
      }
    }, PHOTO_READY_TIMEOUT_MS);
  }

  // ─── Timers ──────────────────────────────────────────────────────────────────

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

    // Strip leading connectors: "y", "y dime", "para", etc.
    const cleaned = after.replace(/^(y\s+dime\s+|y\s+|para\s+ver\s+|,\s*)/, '').trim();
    return cleaned.length > MIN_TRANSCRIPTION_LENGTH ? cleaned : undefined;
  }
}
