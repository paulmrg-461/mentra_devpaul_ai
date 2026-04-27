import { vi } from 'vitest';

export const MentraApp = vi.fn().mockImplementation(() => ({
  onButtonPress: vi.fn(),
  on: vi.fn(),
  run: vi.fn(),
}));

export const GlassesIO = {
  captureTranscription: vi.fn(),
  displayMessage: vi.fn(),
  speak: vi.fn(),
};
