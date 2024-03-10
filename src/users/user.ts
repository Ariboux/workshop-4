import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, BASE_USER_PORT } from "../config";
import { GetNodeRegistryBody, Node } from "../registry/registry";
import { createRandomSymmetricKey, exportSymKey, rsaEncrypt, symEncrypt } from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let getLastReceivedMessage: string | null = null;
  let getLastSentMessage: string | null = null;

  let getLastCircuit: Node[] = [];

  _user.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  _user.post("/message", (req, res) => {
    const body = req.body as SendMessageBody;
    getLastSentMessage = body.message;
    res.status(200).send("success");
  });

  _user.get("/getLastReceivedMessage", (_req, res) => {
    res.json({ result: getLastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (_req, res) => {
    res.json({ result: getLastSentMessage });
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  _user.get("/getLastCircuit", (_req, res) => {
    res.status(200).json({ result: getLastCircuit.map((node) => node.nodeId) });
  });

  _user.post("/sendMessage", async (req, res) => {
    const message = req.body.message;
    const destinationUserId = req.body.destinationUserId;

    const nodes = await fetch(`http://localhost:8080/getNodeRegistry`).then((res) => res.json() as Promise<GetNodeRegistryBody>)
    .then((body) => body.nodes);

    let nodeCircuit: Node[] = [];

    while (nodeCircuit.length < 3) {
      const randomNode = nodes[Math.floor(Math.random()*nodes.length)];
      if (!nodeCircuit.includes(randomNode)) {
        nodeCircuit.push(randomNode);
      }
    }

    let dest = `${BASE_USER_PORT+destinationUserId}`.padStart(10,'0');
    let msgFinal = message;
    for (const node of nodeCircuit) {
      const symetricKey = await createRandomSymmetricKey();
      const symetricKey64 = await exportSymKey(symetricKey);
      const encryptedMsg = await symEncrypt(symetricKey, `${dest + msgFinal}`);
      dest = `${BASE_ONION_ROUTER_PORT + node.nodeId}`.padStart(10, '0');
      const encryptedSymetricKey = await rsaEncrypt(symetricKey64, node.pubKey);
      msgFinal = encryptedSymetricKey + encryptedMsg;
    }

    nodeCircuit.reverse();
    getLastCircuit = nodeCircuit;
    getLastSentMessage = message;
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + nodeCircuit[0].nodeId}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: msgFinal }),
    });
    res.status(200).send("success");
  });
  return server;
}
