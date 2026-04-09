import { WebSocketServer } from "ws";
import { openUplinks } from "@ndn/cli-common";
import { produce } from "@ndn/endpoint";
import { Data, Name, digestSigning } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";
import "dotenv/config";
import { ConnectNFD } from "./src/connections/NfdCore.js";
import { ConnectionWebSocket } from "./src/connections/WebsocketCore.js";
import { initNDNRepo } from "./src/controllers/ndnRepoManager.js";

ConnectNFD();
initNDNRepo();
ConnectionWebSocket();
const NDN_PREFIX = process.env.PREFIX;
