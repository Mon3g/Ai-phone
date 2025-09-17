// utils/encodeMuLaw.js
// Simple μ-law encoder to convert PCM16 audio to 8-bit μ-law

export default function encodeMuLaw(pcm16Buffer) {
  const pcm16 = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.length / 2);
  const ulaw = Buffer.alloc(pcm16.length);

  for (let i = 0; i < pcm16.length; i++) {
    let sample = pcm16[i];

    // μ-law constants
    const MU = 255;
    const MAX = 0x7FFF;

    // Clip sample to max range
    if (sample > MAX) sample = MAX;
    if (sample < -MAX) sample = -MAX;

    // Convert to μ-law
    const sign = (sample < 0) ? 0x7F : 0xFF;
    sample = Math.abs(sample);
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
    const mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0F;
    ulaw[i] = (sign ^ ((exponent << 4) | mantissa));
  }

  return ulaw;
}
