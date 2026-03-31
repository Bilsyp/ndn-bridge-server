import { WebSocketServer } from "ws";
export async function ConnectionWebSocket() {
  const WS_PORT = process.env.PORT;
  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`🚀 WebSocket Server aktif di ws://localhost:${WS_PORT}`);
}
