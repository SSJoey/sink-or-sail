import * as Phaser from "phaser";
import { pageTitle } from "./title.ts";

class SeaScene extends Phaser.Scene {
  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, pageTitle(), {
        fontFamily: "sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  title: pageTitle(),
  backgroundColor: "#1d4f91",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: SeaScene,
});
