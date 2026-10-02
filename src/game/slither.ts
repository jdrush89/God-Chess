export const qualifyingSnake = <Cell extends string>(
  origin: Cell,
  occupied: (cell: Cell) => boolean,
  diagonalNeighbors: (cell: Cell) => readonly Cell[],
  orthogonalNeighbors: (cell: Cell) => readonly Cell[],
) => {
  if (!occupied(origin)) return [];
  const snake: Cell[] = [];
  const visited = new Set<Cell>();
  const pending = [origin];
  while (pending.length) {
    const cell = pending.pop()!;
    if (visited.has(cell) || !occupied(cell)) continue;
    visited.add(cell);
    snake.push(cell);
    for (const neighbor of diagonalNeighbors(cell)) {
      if (!visited.has(neighbor) && occupied(neighbor)) pending.push(neighbor);
    }
  }
  return snake.every((cell) =>
    orthogonalNeighbors(cell).every((neighbor) => !occupied(neighbor))
  )
    ? snake
    : [];
};
