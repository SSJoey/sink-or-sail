import { defineServer } from "@colyseus/core";
import express from "express";
import { CLIENT_DIST_DIR } from "./config.ts";

export const server = defineServer({
  rooms: {},
  express: (app) => {
    app.use(express.static(CLIENT_DIST_DIR));
  },
});
