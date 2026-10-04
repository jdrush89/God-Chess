export const qualifyingSnake = <Cell extends string>(
  origin: Cell,
  occupied: (cell: Cell) => boolean,
  diagonalNeighbors: (cell: Cell) => readonly Cell[],
  orthogonalNeighbors: (cell: Cell) => readonly Cell[],
) => {
  const qualifies = (cell: Cell) =>
    occupied(cell) &&
    diagonalNeighbors(cell).some((neighbor) => occupied(neighbor)) &&
    orthogonalNeighbors(cell).every((neighbor) => !occupied(neighbor));

  if (!qualifies(origin)) return [];
  const snake: Cell[] = [];
  const visited = new Set<Cell>();
  const pending = [origin];
  while (pending.length) {
    const cell = pending.pop()!;
    if (visited.has(cell) || !qualifies(cell)) continue;
    visited.add(cell);
    snake.push(cell);
    for (const neighbor of diagonalNeighbors(cell)) {
      if (!visited.has(neighbor) && qualifies(neighbor)) pending.push(neighbor);
    }
  }
  return snake;
};
