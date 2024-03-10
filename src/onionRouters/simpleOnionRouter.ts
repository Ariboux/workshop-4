import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateKey, generateKeyPair } from "crypto";
import { exportPrvKey, exportPubKey, generateRsaKeyPair, rsaDecrypt, symDecrypt } from "../crypto";
import { hostname } from "os";
import http from "http";
import { parse } from "path";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  const {publicKey, privateKey} = await generateRsaKeyPair();
  let publicKeyString = await exportPubKey(publicKey);
  let privateKeyString = await exportPrvKey(privateKey);

  const data = JSON.stringify({
    nodeId,
    publicKey: publicKeyString,
  });

  const options = {
    hostname: "localhost",
    port: REGISTRY_PORT,
    path: "/registerNode",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  }

  const request = http.request(options, (res) => {
    console.log(`statusCode: ${res.statusCode}`);
    res.on("data", (d) => {
      process.stdout.write(d);
    });
  });
  request.on("error", (error) => {
    console.error(error);
  });
  request.write(data);
  request.end();

  let getLastReceivedEncryptedMessage: string | null = null;
  let getLastReceivedDecryptedMessage: string | null = null;
  let getLastMessageDestination: number | null = null;

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (_req, res) => {
    res.json({ result: getLastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (_req, res) => {
    res.json({ result: getLastReceivedDecryptedMessage });
  });
  
  onionRouter.get("/getLastMessageDestination", (_req, res) => {
    res.json({ result: getLastMessageDestination });
  });

  onionRouter.get("/getPrivateKey", (_req, res) => {
    res.json({ result: privateKeyString });
  });

  onionRouter.post("/message", async (req, res) => {
    const { destination, message } = req.body;
    console.log(`Received message for ${destination}: ${message}`);
    getLastReceivedEncryptedMessage = message;
    getLastMessageDestination = destination;

    const decryptedKey = await rsaDecrypt(message.slice(0,344),privateKey);
    const decryptedMessage = await symDecrypt(decryptedKey, message.slice(344));
    const nextDestination = parseInt(decryptedMessage.slice(0,1));
    const remainingMessage = decryptedMessage.slice(1);

    if (nextDestination === nodeId) {
      getLastReceivedDecryptedMessage = remainingMessage;
      await fetch(`http://localhost:${REGISTRY_PORT}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination,
          message: remainingMessage,
        }),
      });
      res.status(200).send("Message delivered");
      return;
    }

  });


  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}
