export class CounterButton {
  count: number = 0;
  label: string;

  constructor(label: string = 'Counter') {
    this.label = label;
  }

  press(): void {
    this.count++;
  }

  unpress(): void {
    this.count--;
  }

  reset(): void {
    this.count = 0;
  }

  render(): string {
    return `[ ${this.label}: ${this.count} ]`;
  }

  toString(): string {
    return this.render();
  }
}