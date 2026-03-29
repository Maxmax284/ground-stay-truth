/**
 * Fenrir Lock Event Dispatcher
 *
 * Queues security events client-side and batch-sends them to the
 * fenrir-dispatch Edge Function. Fire-and-forget — failures never
 * break GroundStay's core functionality.
 */
import type { FenrirEvent } from "./types";
import type { FenrirConfig } from "./config";
import { DEFAULT_FENRIR_CONFIG } from "./config";
import { supabase } from "@/integrations/supabase/client";

class FenrirDispatcher {
  private queue: FenrirEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private config: FenrirConfig = DEFAULT_FENRIR_CONFIG;
  private flushing = false;

  /** Update config (called when policy_settings load) */
  configure(config: Partial<FenrirConfig>) {
    this.config = { ...this.config, ...config };

    // Restart flush interval if changed
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.config.enabled) {
      this.flushTimer = setInterval(() => this.flush(), this.config.batchIntervalMs);
    }
  }

  /** Enqueue a security event. Returns immediately (fire-and-forget). */
  emit(event: FenrirEvent) {
    if (!this.config.enabled) return;

    this.queue.push({
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });

    // Auto-start flush timer if not running
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), this.config.batchIntervalMs);
    }
  }

  /** Flush queued events to the Edge Function */
  private async flush() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const batch = this.queue.splice(0, this.config.maxBatchSize);

    try {
      await supabase.functions.invoke("fenrir-dispatch", {
        body: { events: batch },
      });
    } catch (err) {
      // Re-queue failed events (with a cap to prevent memory leaks)
      if (this.queue.length < 500) {
        this.queue.unshift(...batch);
      }
      console.error("[fenrir] dispatch failed:", err);
    } finally {
      this.flushing = false;
    }

    // Stop timer if queue is empty
    if (this.queue.length === 0 && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Force flush (e.g. on page unload) */
  async forceFlush() {
    await this.flush();
  }

  /** Cleanup */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// Singleton instance
export const fenrirDispatcher = new FenrirDispatcher();
