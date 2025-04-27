// TypeScript: Service for parsing and processing training log messages

/**
 * Data structure representing a single training record.
 */
export type TrainingRecord = {
  userId: string;
  date: Date;
  shop: string;
  event: string;
  weight: number;
  reps: number;
  topSet: boolean;
};


/**
 * Check if a given message follows the expected training record format.
 * @param message The text message from LINE
 * @returns True if the message is a training record, false otherwise
 */
export function isTrainingRecord(message: string): boolean {
  const firstLine = message.split('\n')[0].trim();
  const regex = /^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?\s.+$/;
  return regex.test(firstLine);
}


/**
 * Parse a training log message into a structured list of records.
 * @param userId The LINE user ID
 * @param message The raw training log text
 * @returns An array of structured TrainingRecord objects
 */
export function parseTrainingLog(userId: string, message: string): TrainingRecord[] {
  const lines = message.trim().split('\n').map(line => line.trim());
  const [dateShopLine, ...workoutLines] = lines;

  const dateShopMatch = dateShopLine.match(/^(\d{1,4})\/(\d{1,2})\s+(.+)$/);
  if (!dateShopMatch) throw new Error('Invalid first line format');

  const [, month, day, shop] = dateShopMatch;
  const year = new Date().getFullYear();
  const date = new Date(`${year}/${month}/${day}`);

  const records: TrainingRecord[] = [];

  workoutLines.forEach(line => {
    const [eventName, setsText] = line.split(/\s(.+)/);
    if (!setsText) throw new Error('Invalid workout line format');

    const sets = setsText.split(',').map(pair => {
      const [weightStr, repsStr] = pair.split(':');
      return {
        weight: parseFloat(weightStr),
        reps: parseInt(repsStr, 10),
      };
    });

    let topSetIndex = 0;
    sets.forEach((set, idx) => {
      const top = sets[topSetIndex];
      if (set.weight > top.weight || (set.weight === top.weight && set.reps > top.reps)) {
        topSetIndex = idx;
      }
    });

    sets.forEach((set, idx) => {
      records.push({
        userId,
        date,
        shop,
        event: eventName,
        weight: set.weight,
        reps: set.reps,
        topSet: idx === topSetIndex,
      });
    });
  });

  return records;
}
