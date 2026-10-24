/**
 * Input is sent at a steady rate, so a quick tap of the Pack button (or E) could fall between two
 * sends and be lost. The latch remembers a press until it has been sent once.
 */
export class PackLatch {
  private down = false;
  private pressedSinceSend = false;

  /** Called every frame with whether the Pack button is down right now. */
  update(down: boolean): void {
    this.down = down;
    if (down) this.pressedSinceSend = true;
  }

  /** Called when an input message is sent: pressed if it is down now or was pressed since the last send. */
  take(): boolean {
    const pressed = this.down || this.pressedSinceSend;
    this.pressedSinceSend = false;
    return pressed;
  }
}
