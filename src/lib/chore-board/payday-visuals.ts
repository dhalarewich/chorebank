export interface PaydayCoinPose {
  delay: number;
  duration: number;
  endX: number;
  endY: number;
  flightX: number;
  interest: boolean;
  rotation: number;
  scale: number;
  startX: number;
  tilt: number;
  zIndex: number;
}

function seededRandom(seed: number) {
  let value = Math.abs(Math.trunc(seed)) % 2147483647 || 1;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function createPaydayCoinLayout({
  height,
  interest,
  seed,
  stars,
  width,
}: {
  height: number;
  interest: number;
  seed: number;
  stars: number;
  width: number;
}): PaydayCoinPose[] {
  const earned = Math.max(0, stars) + Math.max(0, interest);
  const total = Math.min(30, earned);
  if (total === 0) return [];

  const random = seededRandom(seed);
  const coinSize = Math.max(28, Math.min(48, Math.round(height * 0.16)));
  const columns = Math.max(6, Math.min(10, Math.floor(width / (coinSize * 0.78))));
  const interestCount = interest > 0 ? Math.max(1, Math.min(6, Math.round((interest / earned) * total))) : 0;
  const rowSizes: number[] = [];
  let remaining = total;

  while (remaining > 0) {
    const capacity = Math.max(3, columns - rowSizes.length);
    const size = Math.min(remaining, capacity);
    rowSizes.push(size);
    remaining -= size;
  }

  let index = 0;
  return rowSizes.flatMap((rowSize, row) =>
    Array.from({ length: rowSize }, (_, column) => {
      const currentIndex = index;
      index += 1;
      const spacing = coinSize * 0.7;
      const endX = (column - (rowSize - 1) / 2) * spacing + (random() - 0.5) * coinSize * 0.14;
      const endY = height - coinSize - 17 - row * coinSize * 0.32 + (random() - 0.5) * 3;
      const side = currentIndex % 2 === 0 ? -1 : 1;

      return {
        delay: 90 + currentIndex * 58 + random() * 42,
        duration: 760 + random() * 260,
        endX,
        endY,
        flightX: endX + side * (32 + random() * width * 0.14),
        interest: currentIndex >= total - interestCount,
        rotation: side * (190 + random() * 330),
        scale: 0.92 + random() * 0.16,
        startX: side * (width * (0.22 + random() * 0.26)),
        tilt: (random() - 0.5) * 17,
        zIndex: 10 + row,
      };
    }),
  );
}
