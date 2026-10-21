import { type State, parse } from "./model";
export class Sync {
  channel: BroadcastChannel | null = null;
  id = crypto.randomUUID();
  constructor(
    private receive: (s: State) => void,
    private current: () => State,
    private authority: boolean,
  ) {
    try {
      this.channel = new BroadcastChannel("projection-playground");
      this.channel.onmessage = (e) => this.read(e.data);
    } catch {}
    window.addEventListener("storage", (e) => {
      if (e.key === "projection-sync" && e.newValue)
        this.read(JSON.parse(e.newValue));
    });
    this.send({ type: "hello" });
  }
  read(m: any) {
    if (m.id === this.id) return;
    if (m.type === "hello" && this.authority) this.publish();
    if (m.type === "state" && !this.authority) {
      try {
        this.receive(parse(JSON.stringify(m.state)));
      } catch {}
    }
  }
  send(m: any) {
    const data = { ...m, id: this.id, stamp: Date.now() };
    this.channel?.postMessage(data);
    try {
      localStorage.setItem("projection-sync", JSON.stringify(data));
    } catch {}
  }
  publish() {
    this.send({ type: "state", state: this.current() });
  }
}
