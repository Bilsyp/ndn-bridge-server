import { WebSocketServer } from "ws";
import {
  handleClose,
  handleMessage,
} from "../controllers/WebSocketController.js";
export async function ConnectionWebSocket() {
  const WS_PORT = process.env.PORT;
  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`🚀 WebSocket Server aktif di ws://localhost:${WS_PORT}`);

  wss.on("connection", (ws) => {
    ws.on("message", (message) => handleMessage(ws, message));
    ws.on("close", handleClose);
  });
}
