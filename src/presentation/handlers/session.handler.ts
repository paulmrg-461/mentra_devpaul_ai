import { AppSession } from '@mentra/sdk';
import { VoiceAssistantUseCase } from '../../domain/use-cases/voice-assistant.use-case.js';
import { VisionAssistantUseCase } from '../../domain/use-cases/vision-assistant.use-case.js';
import { MeetingAssistantUseCase } from '../../domain/use-cases/meeting-assistant.use-case.js';
import { MeetingTranscript } from '../../domain/entities/meeting-transcript.js';
import {
  WAKE_WORD,
  STOP_COMMANDS,
  VISION_COMMANDS,
  MEETING_START_COMMANDS,
  MEETING_END_COMMANDS,
  MIN_TRANSCRIPTION_LENGTH,
  USER_MESSAGES,
} from '../../shared/config/constants.js';
import { AudioSessionManager } from './audio-session.manager.js';

export enum SessionState {
  IDLE,
  LISTENING,
  PROCESSING,
  MEETING
}

export class SessionHandler {
  private state: SessionState = SessionState.IDLE;
  private audioManager: AudioSessionManager | null = null;

  constructor(
    private voiceUseCase: VoiceAssistantUseCase,
    private visionUseCase: VisionAssistantUseCase,
    private meetingUseCase: MeetingAssistantUseCase,
    private meetingTranscript: MeetingTranscript
  ) {}

  setup(session: AppSession) {
    console.log('Initializing DevPaul Session Handler (Logging enabled)...');
    this.state = SessionState.IDLE;

    this.audioManager = new AudioSessionManager(session);
    this.audioManager.startBackgroundListening();

    session.events.onTranscriptionForLanguage('es-ES', async (data) => {
      console.log(`[DEBUG] Transcription received: "${data.text}" | isFinal: ${data.isFinal} | Current State: ${this.state}`);

      if (!data.text) return;

      const lowerText = data.text.toLowerCase();
      const textLength = lowerText.trim().length;

      if (textLength < MIN_TRANSCRIPTION_LENGTH) return;

      if (this.audioManager?.isListening()) {
        this.audioManager.addToTranscriptionBuffer(lowerText);
      }

      switch (this.state) {
        case SessionState.IDLE:
          await this.handleIdleState(session, lowerText);
          break;

        case SessionState.LISTENING:
          if ((data as any).isFinal === false) return;
          console.log(`[STATE] Command detected in LISTENING: "${data.text}"`);
          this.state = SessionState.PROCESSING;
          await this.processCommand(session, lowerText);
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

  private async handleMeetingState(session: AppSession, lowerText: string, data: any) {
    // Accumulate all speech into transcript
    if ((data as any).isFinal !== false) {
      this.meetingTranscript.addEntry(lowerText);
    }

    // Only act on final transcriptions with wake word
    if ((data as any).isFinal === false) return;
    if (!lowerText.includes(WAKE_WORD)) return;

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

  private async handleMeetingQuery(session: AppSession, question: string) {
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

  private async endMeeting(session: AppSession) {
    console.log('[STATE] Ending meeting. Generating summary...');
    this.state = SessionState.PROCESSING;

    try {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.meetingEnded);
      await this.audioManager?.speak(USER_MESSAGES.meetingEnded, false);

      const summary = await this.meetingUseCase.generateSummary(
        this.meetingTranscript,
        (msg) => session.layouts.showTextWall(msg)
      );

      console.log('[MEETING] Summary generated.');
      session.layouts.showTextWall(summary);
      await this.audioManager?.speak(summary, true);
    } catch (error) {
      console.error('[MEETING] Summary error:', error);
      session.layouts.showTextWall(USER_MESSAGES.meetingError);
      await this.audioManager?.speak(USER_MESSAGES.meetingError, false);
    } finally {
      this.meetingTranscript.clear();
      this.state = SessionState.IDLE;
      console.log('[STATE] Meeting ended. Back to IDLE.');
    }
  }

  private async processCommand(session: AppSession, text: string) {
    try {
      if (this.isStopCommand(text)) {
        await this.handleStop(session);
        return;
      }

      if (this.isVisionCommand(text)) {
        await this.handleVisionRequest(session);
      } else {
        await this.handleVoiceRequest(session, text);
      }
    } catch (err) {
      console.error('[ERROR] Error during processing:', err);
    } finally {
      this.state = SessionState.IDLE;
      console.log('[STATE] Back to IDLE. Ready for "DevPaul".');
    }
  }

  private async handleIdleState(session: AppSession, lowerText: string) {
    if (!lowerText.includes(WAKE_WORD)) return;

    console.log(`[STATE] Wake word "${WAKE_WORD}" detected.`);

    const commandPart = this.extractCommandAfterWakeWord(lowerText);

    if (commandPart && commandPart.length > MIN_TRANSCRIPTION_LENGTH) {
      if (this.isMeetingStartCommand(commandPart)) {
        await this.startMeeting(session);
        return;
      }

      console.log(`[STATE] Immediate command detected: "${commandPart}"`);
      this.state = SessionState.PROCESSING;
      await this.processCommand(session, commandPart);
      return;
    }

    console.log('[STATE] No immediate command. Switching to LISTENING.');
    this.state = SessionState.LISTENING;
    await this.transitionToListening(session);
  }

  private async startMeeting(session: AppSession) {
    console.log('[STATE] Starting meeting mode.');
    this.meetingTranscript.clear();
    this.state = SessionState.MEETING;
    session.layouts.showTextWall(USER_MESSAGES.meetingStarted);
    await this.audioManager?.speak(USER_MESSAGES.meetingStarted, false);
  }

  private extractCommandAfterWakeWord(text: string): string | undefined {
    return text.split(WAKE_WORD)[1]?.trim();
  }

  private async transitionToListening(session: AppSession) {
    session.layouts.showTextWall(USER_MESSAGES.idle);
    await session.audio.speak(USER_MESSAGES.idle);
  }

  private isStopCommand(text: string): boolean {
    return STOP_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isVisionCommand(text: string): boolean {
    return VISION_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isMeetingStartCommand(text: string): boolean {
    return MEETING_START_COMMANDS.some(cmd => text.includes(cmd));
  }

  private isMeetingEndCommand(text: string): boolean {
    return MEETING_END_COMMANDS.some(cmd => text.includes(cmd));
  }

  private handleManualTrigger(session: AppSession) {
    if (this.state === SessionState.PROCESSING) return;
    this.state = SessionState.LISTENING;
    session.layouts.showTextWall(USER_MESSAGES.listening);
  }

  async handleButtonPress(session: AppSession) {
    this.handleManualTrigger(session);
  }

  async handleStop(session: AppSession) {
    console.log('Stop command received.');
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

  async handleVoiceRequest(session: AppSession, text: string) {
    try {
      await this.audioManager?.cancelCurrentSpeech();

      const response = await this.voiceUseCase.execute(text, (msg) => {
        session.layouts.showTextWall(msg);
      });

      console.log(`AI Response: ${response}`);
      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('Voice Assistant Error:', error);
      session.layouts.showTextWall(USER_MESSAGES.voiceError);
      await this.audioManager?.speak(USER_MESSAGES.voiceError, false);
    }
  }

  async handleVisionRequest(session: AppSession) {
    try {
      await this.audioManager?.cancelCurrentSpeech();
      session.layouts.showTextWall(USER_MESSAGES.capturing);

      const photo = await session.camera.requestPhoto({
        size: 'medium',
        saveToGallery: false
      });

      if (!photo || !photo.buffer) {
        session.layouts.showTextWall(USER_MESSAGES.photoError);
        await this.audioManager?.speak(USER_MESSAGES.photoError, false);
        return;
      }

      const base64Image = photo.buffer.toString('base64');

      const response = await this.visionUseCase.execute(base64Image, (msg) => {
        session.layouts.showTextWall(msg);
      });

      console.log(`Vision Response: ${response}`);
      session.layouts.showTextWall(response);
      await this.audioManager?.speak(response, true);
    } catch (error) {
      console.error('Vision Assistant Error:', error);
      session.layouts.showTextWall(USER_MESSAGES.visionError);
      await this.audioManager?.speak(USER_MESSAGES.visionError, false);
    }
  }

  async handleDoubleTap(session: AppSession) {
    if (this.state === SessionState.PROCESSING) return;
    console.log('Double tap vision request...');
    this.state = SessionState.PROCESSING;
    await this.handleVisionRequest(session);
    this.state = SessionState.IDLE;
  }
}
