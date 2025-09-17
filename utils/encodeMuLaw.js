// utils/encodeMuLaw.js
// μ-law encoder for PCM16 audio → G.711 μ-law (8kHz)

export default function encodeMuLaw(pcm16Buffer) {
  const pcm16 = new Int16Array(
    pcm16Buffer.buffer,
    pcm16Buffer.byteOffset,
    pcm16Buffer.length / 2
  );
  const ulaw = Buffer.alloc(pcm16.length);

  for (let i = 0; i < pcm16.length; i++) {
    let sample = pcm16[i];

    // μ-law constants
    const BIAS = 0x84;
    const CLIP = 32635;

    if (sample > CLIP) sample = CLIP;
    else if (sample < -CLIP) sample = -CLIP;

    let sign = sample < 0 ? 0x7F : 0xFF;
    sample = Math.abs(sample) + BIAS;

    // Find exponent
    let exponent = 7;
    for (
      let expMask = 0x4000;
      (sample & expMask) === 0 && exponent > 0;
      exponent--, expMask >>= 1
    );

    // Compute mantissa
    let mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0F;

    ulaw[i] = sign ^ ((exponent << 4) | mantissa);
  }

  return ulaw;
}
