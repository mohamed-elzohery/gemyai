/**
 * An audio worklet processor that stores the PCM audio data sent from the main thread
 * to a buffer and plays it.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Init buffer
    this.bufferSize = 24000 * 180; // 24kHz x 180 seconds
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    // Track whether we are actively outputting audio so the main thread
    // can drive UI states (orb "talking", text reveal) from real playback.
    this._wasPlaying = false;

    // Handle incoming messages from main thread
    this.port.onmessage = (event) => {
      // Reset the buffer when 'endOfAudio' message received
      if (event.data.command === "endOfAudio") {
        this.readIndex = this.writeIndex; // Clear the buffer
        console.log("endOfAudio received, clearing the buffer.");
        // Immediately report that playback stopped
        if (this._wasPlaying) {
          this._wasPlaying = false;
          this.port.postMessage({ type: "playbackState", playing: false });
        }
        return;
      }

      // Decode the base64 data to int16 array.
      const int16Samples = new Int16Array(event.data);

      // Add the audio data to the buffer
      this._enqueue(int16Samples);
    };
  }

  // Push incoming Int16 data into our ring buffer.
  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      // Convert 16-bit integer to float in [-1, 1]
      const floatVal = int16Samples[i] / 32768;

      // Store in ring buffer for left channel only (mono)
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      // Overflow handling (overwrite oldest samples)
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  // The system calls `process()` ~128 samples at a time (depending on the browser).
  // We fill the output buffers from our ring buffer.
  process(inputs, outputs, parameters) {
    // Write a frame to the output
    const output = outputs[0];
    const framesPerBlock = output[0].length;

    const isPlaying = this.readIndex !== this.writeIndex;

    for (let frame = 0; frame < framesPerBlock; frame++) {
      // Write the sample(s) into the output buffer
      output[0][frame] = this.buffer[this.readIndex]; // left channel
      if (output.length > 1) {
        output[1][frame] = this.buffer[this.readIndex]; // right channel
      }

      // Move the read index forward unless underflowing
      if (this.readIndex != this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }

    // Detect transitions: not-playing → playing, or playing → not-playing
    const nowPlaying = this.readIndex !== this.writeIndex;
    if (isPlaying && !nowPlaying && this._wasPlaying) {
      // Buffer just drained — playback stopped
      this._wasPlaying = false;
      this.port.postMessage({ type: "playbackState", playing: false });
    } else if (!this._wasPlaying && isPlaying) {
      // Buffer just started being consumed — playback started
      this._wasPlaying = true;
      this.port.postMessage({ type: "playbackState", playing: true });
    }

    // Returning true tells the system to keep the processor alive
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);
