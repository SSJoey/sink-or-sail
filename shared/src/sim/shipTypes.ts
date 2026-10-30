import { TUNING } from "../tuning.ts";

/** Stage 5: the five ship types, in the order the lobby lists them. The Frigate is the original ship. */
export const SHIP_TYPES = ["frigate", "cutter", "ironclad", "gunboat", "longGun"] as const;
export type ShipType = (typeof SHIP_TYPES)[number];

export const SHIP_TYPE_NAMES: Record<ShipType, string> = {
  frigate: "Frigate",
  cutter: "Cutter",
  ironclad: "Ironclad",
  gunboat: "Gunboat",
  longGun: "Long gun",
};

export type ShipStats = (typeof TUNING.shipTypes)[ShipType];

export const isShipType = (value: unknown): value is ShipType => SHIP_TYPES.includes(value as ShipType);

/** A ship's own values (size, speed, turning, gun, bar, health), from its type. */
export const statsOf = (ship: { type: ShipType }): ShipStats => TUNING.shipTypes[ship.type];
