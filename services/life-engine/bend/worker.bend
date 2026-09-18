import Base
import ./life.bend as Life

def read_line() -> IO(String):
  import "./read_line.c"

def even(text: String) -> String:
  match text:
    case SNil{}:
      SNil{}
    case SCon{head, SNil{}}:
      SCon{head, SNil{}}
    case SCon{head, SCon{skip, rest}}:
      SCon{head, even(rest)}

def odd(text: String) -> String:
  match text:
    case SNil{}:
      SNil{}
    case SCon{head, tail}:
      even(tail)

def first(text: String) -> U32:
  match text:
    case SNil{}:
      0
    case SCon{head, tail}:
      Life.bit(Char.is_eq(head, '1'))

def load(+depth: Nat, +text: String) -> Life.Board:
  match depth:
    case 0n:
      Life.Cell{first(text)}
    case 1n+p:
      Life.Branch{load(p, even(text)), load(p, odd(text))}

def interleave(a: String, b: String) -> String:
  match a b:
    case SNil{} tail:
      tail
    case tail SNil{}:
      tail
    case SCon{ah, at} SCon{bh, bt}:
      SCon{ah, SCon{bh, interleave(at, bt)}}

def digit(value: U32) -> String:
  U32.show(value)

def save(board: Life.Board) -> String:
  match board:
    case Life.Cell{value}:
      digit(value)
    case Life.Branch{left, right}:
      interleave(save(left), save(right))

def advance(count: Nat, board: Life.Board) -> Life.Board:
  match count:
    case 0n:
      board
    case 1n+p:
      advance(p, Life.step(board))

def compute(count: Maybe<&2, Nat>, text: String) -> String:
  match count:
    case None{}:
      "ERROR"
    case Some{n}:
      save(advance(n, load(12n, text)))

# Only this IO shell is non-terminating. The simulation and proofs remain safe.
@unsafe
def serve() -> IO(Unit):
  do IO<Unit>:
    count : String <- read_line()
    board : String <- read_line()
    IO.print(compute(Nat.read(count), board))
    serve()

def main() -> IO(Unit):
  serve()
