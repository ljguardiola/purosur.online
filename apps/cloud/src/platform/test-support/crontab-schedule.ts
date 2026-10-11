import { parseCrontab } from "graphile-worker";

const MINUTE_MS = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

export interface CrontabSchedule {
  task: string;
  gapsMs: number[];
}

export function scheduleOfCrontabLine(crontabLine: string): CrontabSchedule {
  const [item, ...others] = parseCrontab(crontabLine);
  if (!item || others.length > 0) {
    throw new Error(`test setup: expected exactly one crontab item in ${crontabLine}`);
  }
  const runMinutes: number[] = [];
  for (let minuteOfDay = 0; minuteOfDay < MINUTES_PER_DAY; minuteOfDay += 1) {
    const digest = {
      min: minuteOfDay % 60,
      hour: Math.floor(minuteOfDay / 60),
      date: 5,
      month: 1,
      dow: 1,
    };
    if (item.match(digest)) {
      runMinutes.push(minuteOfDay);
    }
  }
  const gapsMs = runMinutes.map((minute, index) => {
    const next = runMinutes[index + 1] ?? (runMinutes[0] ?? 0) + MINUTES_PER_DAY;
    return (next - minute) * MINUTE_MS;
  });
  return { task: item.task, gapsMs };
}
