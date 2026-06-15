import { WebSocketServer } from "ws";
import { openUplinks } from "@ndn/cli-common";
import { produce } from "@ndn/endpoint";
import { Data, Name, digestSigning } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";
import "dotenv/config";
import { ConnectNFD } from "./src/connections/NfdCore.js";
import { ConnectionWebSocket } from "./src/connections/WebsocketCore.js";
import express from "express";
import cors from "cors";
import { initNDNRepo } from "./src/controllers/ndn-repo-manager.js";
ConnectNFD();
initNDNRepo();
ConnectionWebSocket();
const NDN_PREFIX = process.env.PREFIX;
const PORT = 8181;
const app = express();
// 1. Middleware CORS: Wajib agar Shaka Player di browser bisa akses API ini
app.use(cors());
// app.use("/api/ndn", router);
// 2. Middleware JSON: Wajib agar Anda bisa membaca 'observations'
// yang dikirim dari _requestAiInference
app.use(express.json());
app.listen(PORT, () => {
  console.log(`🚀 Server Research Lab berjalan di http://localhost:${PORT}`);
  console.log(`📊 Menunggu data dari Shaka Player...`);
});
