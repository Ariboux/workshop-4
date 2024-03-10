import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";
import { register } from "module";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  let nodeRegistry: Node[] = [];

  _registry.post("/registerNode", (req : Request, res : Response) => {
    const body = req.body as RegisterNodeBody;
    nodeRegistry.push({ nodeId: body.nodeId, pubKey: body.pubKey });
    res.send("success");
  });

  _registry.get("/getNodeRegistry", (req, res) => {
    res.json({ nodes: nodeRegistry });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}
