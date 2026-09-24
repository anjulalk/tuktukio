// Arcade Tuk kinematics (FR-02). Pure + testable. No physics lib (<50KB).

export interface DriveInput {
  readonly throttle: number; // 0..1
  readonly brake: number; // 0..1
  readonly steer: number; // -1..1
}

export interface TukState {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

// Tuk kinematics (FR-02): sluggish 3-wheeler, no physics lib (<50KB).
// Torque falls with speed + quadratic drag, so 0-45 km/h takes ~9s and the
// last 10 km/h is a struggle. Pure + testable.

export interface DriveInput {
  readonly throttle: number; // 0..1 (W)
  readonly brake: number; // 0..1 (S: brake when fast, reverse when slow)
  readonly steer: number; // -1..1 (A/D, screen space)
}

export interface TukState {
  x: number;
  z: number;
  heading: number;
  speed: number; // m/s, +forward
}

export const TUK_MAX_SPEED = 12.5; // ~45 km/h forward
export const TUK_MAX_REVERSE = 3.2; // ~11.5 km/h reverse

export type Gear = "D" | "N" | "R";

export function gearOf(speed: number): Gear {
  if (speed > 0.5) return "D";
  if (speed < -0.5) return "R";
  return "N";
}

export function stepTuk(s: TukState, input: DriveInput, dt: number): void {
  const v: number = s.speed;
  const frac: number = Math.min(1, Math.max(0, v / TUK_MAX_SPEED));
  let a = 0;
  if (v >= 0) {
    // Engine pulls hardest off the line, fades to ~40% at top speed.
    a += 3.6 * input.throttle * (1 - 0.6 * frac);
    if (input.brake > 0 && v > 0.5) a -= 6.5 * input.brake; // service brake
    if (input.brake > 0 && v <= 0.5) a -= 1.6 * input.brake; // pull into reverse
    a -= 0.0042 * v * Math.abs(v); // aero drag
    if (v > 0.1) a -= 0.35; // rolling resistance
    if (input.throttle === 0 && input.brake === 0 && v > 0.1) a -= 0.9; // engine braking
  } else {
    // Reversing: weak engine, strong drag so it stays slow.
    a += 1.6 * input.throttle; // throttle brakes the reverse
    a -= 1.6 * input.brake;
    a -= 0.02 * v * Math.abs(v);
    if (v < -0.1) a += 0.5;
  }
  s.speed += a * dt;
  if (s.speed < -TUK_MAX_REVERSE) s.speed = -TUK_MAX_REVERSE;
  if (s.speed > TUK_MAX_SPEED) s.speed = TUK_MAX_SPEED;
  if (input.throttle === 0 && input.brake === 0 && Math.abs(s.speed) < 0.25) s.speed = 0;
  // Screen-relative steering, calmer at speed: D always turns screen-right.
  const dir: number = s.speed >= 0 ? 1 : -1;
  const steerAuthority: number = Math.min(1, Math.abs(s.speed) / 3.5);
  const highSpeedCalm: number = 1 - 0.45 * Math.min(1, Math.abs(s.speed) / TUK_MAX_SPEED);
  // Chase cam looks along +forward, so screen-right is -heading (see docs).
  // steer: -1 left, +1 right (screen space).
  if (Math.abs(s.speed) > 0.4) s.heading -= input.steer * dir * 2.0 * steerAuthority * highSpeedCalm * dt;
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;
}
