/**
 * Cron jobs.
 *
 * Watchdog: the research-agent loop in `actions/chat.ts` runs inside a
 * Convex node action (hard 10-minute cap, no retry). If the action
 * crashes or is killed mid-loop, the assistant message stays
 * `isStreaming: true` forever and the UI spins. This sweep finalizes
 * anything stuck for >12 minutes, preserving whatever content and
 * research timeline already landed.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "finalize stuck streaming messages",
  { minutes: 5 },
  internal.mutations.messages.finalizeStuck,
  {},
);

export default crons;
