import Base

# A persistent binary tree lets independent branches share a read-only board.
# Depth 12 stores a 64 x 64 torus, one U32 (0 or 1) per leaf.
type Board is Data:
  Cell{value: U32}
  Branch{left: Board, right: Board}

def bit(flag: Bool) -> U32:
  match flag:
    case True{}:
      1
    case False{}:
      0

def rule(+alive: U32, +neighbors: U32) -> U32:
  bit(U32.is_eq(neighbors, 3) || (U32.is_eq(alive, 1) && U32.is_eq(neighbors, 2)))

# Consume only the selected branch; a function choosing evaluated arguments
# would walk the entire board on each lookup.
def lookup(tree: Board, +index: U32, even: Bool) -> U32:
  match tree:
    case Cell{value}:
      value
    case Branch{left, right}:
      match even:
        case True{}:
          lookup(left, (index >> 1n : U32), U32.is_eq((index .&. 2 : U32), 0))
        case False{}:
          lookup(right, (index >> 1n : U32), U32.is_eq((index .&. 2 : U32), 0))

def at(tree: Board, +index: U32) -> U32:
  lookup(tree, index, U32.is_eq((index .&. 1 : U32), 0))

def sample(+board: Board, x: U32, y: U32) -> U32:
  at(board, (((y .&. 63) * 64) + (x .&. 63) : U32))

def neighbors(+board: Board, +x: U32, +y: U32) -> U32:
  (sample(board, x - 1, y - 1) + sample(board, x, y - 1) + sample(board, x + 1, y - 1)
   + sample(board, x - 1, y) + sample(board, x + 1, y)
   + sample(board, x - 1, y + 1) + sample(board, x, y + 1) + sample(board, x + 1, y + 1) : U32)

# Each branch calculates independent cells from the same previous generation.
def evolve(+depth: Nat, +board: Board, +index: U32, +stride: U32) -> Board:
  match depth:
    case 0n:
      Cell{rule(at(board, index), neighbors(board, (index .&. 63 : U32), (index >> 6n : U32)))}
    case 1n+p:
      a b = evolve(p, board, index, (stride * 2 : U32)) evolve(p, board, (index + stride : U32), (stride * 2 : U32))
      Branch{a, b}

def step(board: Board) -> Board:
  evolve(12n, board, 0, 1)
