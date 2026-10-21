import type { Point, State } from "./model";
/** Future integrations provide normalized points without owning rendering or persistence. */
export interface TrackingProvider {
  start(): Promise<void>;
  stop(): void;
  subscribe(listener: (points: Point[], timestamp: number) => void): () => void;
}
export interface RemoteTransport {
  send(state: State): void;
  subscribe(listener: (state: State) => void): () => void;
  close(): void;
}
export interface BeatClock {
  phase(timestamp: number): number;
}
