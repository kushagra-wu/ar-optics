/**
 * Lifecycle wrapper around `XRHitTestSource`. Requests a viewer-space hit-test source on session
 * start and exposes the latest hit pose (in the active local reference space) for each XR frame.
 */
export class HitTester {
  private source: XRHitTestSource | null = null;
  private requested = false;

  async start(session: XRSession): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const result = await session.requestHitTestSource!({ space: viewerSpace });
      this.source = result ?? null;
    } catch (err) {
      console.warn('[hitTest] Failed to acquire hit-test source:', err);
      this.source = null;
    }
  }

  stop(): void {
    this.source?.cancel();
    this.source = null;
    this.requested = false;
  }

  /** Returns the most recent hit pose in `referenceSpace`, or null if no hit is available. */
  getLatestPose(frame: XRFrame, referenceSpace: XRReferenceSpace): XRPose | null {
    if (!this.source) return null;
    const results = frame.getHitTestResults(this.source);
    if (results.length === 0) return null;
    const pose = results[0].getPose(referenceSpace);
    return pose ?? null;
  }
}
