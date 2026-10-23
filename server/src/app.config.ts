import { defineRoom, defineServer } from "@colyseus/core";
import express from "express";
import { ROOM_NAME } from "@sink-or-sail/shared";
import { CLIENT_DIST_DIR } from "./config.ts";
import { CrewRoom } from "./rooms/CrewRoom.ts";

export const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(CrewRoom),
  },
  express: (app) => {
    app.use(express.static(CLIENT_DIST_DIR));
  },
});
