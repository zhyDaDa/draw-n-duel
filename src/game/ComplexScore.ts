export class ComplexScore {
  real: number;
  imag: number;

  constructor(real: number = 0, imag: number = 0) {
    this.real = real;
    this.imag = imag;
  }

  static zero(): ComplexScore {
    return new ComplexScore(0, 0);
  }

  static from(real: number, imag: number = 0): ComplexScore {
    return new ComplexScore(real, imag);
  }

  static fromPolar(magnitude: number, angle: number): ComplexScore {
    const r = Math.max(0, magnitude);
    return new ComplexScore(r * Math.cos(angle), r * Math.sin(angle));
  }

  clone(): ComplexScore {
    return new ComplexScore(this.real, this.imag);
  }

  set(real: number, imag: number = 0): ComplexScore {
    this.real = real;
    this.imag = imag;
    return this;
  }

  setFrom(other: ComplexScore): ComplexScore {
    return this.set(other.real, other.imag);
  }

  addReal(value: number): ComplexScore {
    this.real += value;
    return this;
  }

  add(other: ComplexScore): ComplexScore {
    this.real += other.real;
    this.imag += other.imag;
    return this;
  }

  subtractReal(value: number): ComplexScore {
    this.real -= value;
    return this;
  }

  multiplyScalar(value: number): ComplexScore {
    this.real *= value;
    this.imag *= value;
    return this;
  }

  divideScalar(value: number): ComplexScore {
    if (value === 0) {
      // 避免除以零导致 NaN，保留原值
      return this;
    }
    return this.multiplyScalar(1 / value);
  }

  power(exponent: number): ComplexScore {
    const r = this.modulus();
    const theta = this.argument();
    const newR = Math.pow(r, exponent);
    const newTheta = theta * exponent;
    this.real = newR * Math.cos(newTheta);
    this.imag = newR * Math.sin(newTheta);
    return this;
  }

  negate(): ComplexScore {
    this.real = -this.real;
    this.imag = -this.imag;
    return this;
  }

  modulus(): number {
    return Math.hypot(this.real, this.imag);
  }

  argument(): number {
    return Math.atan2(this.imag, this.real);
  }

  normalizeMagnitude(target: number): ComplexScore {
    const current = this.modulus();
    if (current === 0) {
      this.real = target;
      this.imag = 0;
      return this;
    }
    const ratio = target / current;
    return this.multiplyScalar(ratio);
  }

  scaleMagnitude(factor: number): ComplexScore {
    return this.multiplyScalar(factor);
  }

  compareMagnitude(other: ComplexScore | number): number {
    const mine = this.modulus();
    const theirs =
      typeof other === "number" ? Math.abs(other) : other.modulus();
    if (mine < theirs - Number.EPSILON) return -1;
    if (mine > theirs + Number.EPSILON) return 1;
    return 0;
  }

  isMagnitudeLessThan(value: number): boolean {
    return this.compareMagnitude(value) < 0;
  }

  isMagnitudeGreaterThan(value: number): boolean {
    return this.compareMagnitude(value) > 0;
  }

  toString(): string {
    const realPart = Number(this.real.toFixed(2));
    const imagPart = Number(this.imag.toFixed(2));
    if (Math.abs(imagPart) < 1e-6) {
      return `${realPart}`;
    }
    if (Math.abs(realPart) < 1e-6) {
      if (Math.abs(imagPart - 1) < 1e-6) return "i";
      if (Math.abs(imagPart + 1) < 1e-6) return "-i";
      return `${imagPart}i`;
    }
    const sign = imagPart >= 0 ? "+" : "-";
    const imagAbs = Math.abs(imagPart);
    const imagStr = Math.abs(imagAbs - 1) < 1e-6 ? "i" : `${imagAbs}i`;
    return `${realPart} ${sign} ${imagStr}`;
  }

  toJSON(): { real: number; imag: number } {
    return { real: this.real, imag: this.imag };
  }
}
