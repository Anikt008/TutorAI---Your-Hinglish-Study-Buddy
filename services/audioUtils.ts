// Base64 decoding
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert PCM data to AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sourceSampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  
  const buffer = ctx.createBuffer(numChannels, frameCount, sourceSampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Singleton AudioContext
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

export async function playAudioStream(base64Audio: string): Promise<void> {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    
    // Initialize singleton context if needed
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }
    
    // CRITICAL: Resume context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Stop currently playing audio
    if (currentSource) {
      try {
        currentSource.stop();
        currentSource.disconnect();
      } catch (e) {
        // Ignore errors if source already stopped
      }
      currentSource = null;
    }
    
    const audioBytes = decode(base64Audio);
    // Explicitly pass 24000Hz as the source rate because that's what Gemini TTS provides
    const audioBuffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    // Track current source
    currentSource = source;

    source.start(0);
    
    return new Promise((resolve) => {
      source.onended = () => {
        source.disconnect();
        if (currentSource === source) {
          currentSource = null;
        }
        resolve();
      };
    });
  } catch (error) {
    console.error("Error playing audio:", error);
    // Hard reset context on error to be safe
    if (audioContext && (audioContext.state === 'closed' || audioContext.state === 'suspended')) {
         // Try to close if not closed to clean up
         try { if(audioContext.state !== 'closed') audioContext.close(); } catch(e) {}
         audioContext = null;
    }
    throw error;
  }
}