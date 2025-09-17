// utils/encodeMuLaw.js
export default function encodeMuLaw(pcm16Buffer) {
  // Convert PCM16 buffer -> Int16Array for sample processing
  const samples = new Int16Array(
    pcm16Buffer.buffer,
    pcm16Buffer.byteOffset,
    pcm16Buffer.length / 2
  );

  const ulawBuffer = Buffer.alloc(samples.length);

  for (let i = 0; i < samples.length; i++) {
    ulawBuffer[i] = linearToMuLawSample(samples[i]);
  }

  return ulawBuffer;
}

// μ-law encoding algorithm (standard ITU G.711 implementation)
function linearToMuLawSample(sample) {
  const MU = 255;
  const MAX = 32768;

  // Clamp to prevent overflow
  sample = Math.max(-MAX, Math.min(MAX, sample));

  // Get sign and magnitude
  const sign = sample < 0 ? 0x80 : 0x00;
  let magnitude = Math.abs(sample);

  // μ-law compression
  let exponent = 7;
  for (let expMask = 0x4000; (magnitude & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  let mantissa = (magnitude >> ((exponent === 0 ? 4 : exponent + 3))) & 0x0F;
  let ulawByte = ~(sign | (exponent << 4) | mantissa);

  return ulawByte & 0xFF;
}
