import Base
import ./bend/life.bend as Life
import ./LAWS.bend as Laws

def Laws.rule_0_0():
  {==}

def Laws.rule_0_1():
  {==}

def Laws.rule_0_2():
  {==}

def Laws.rule_0_3():
  {==}

def Laws.rule_0_4():
  {==}

def Laws.rule_0_5():
  {==}

def Laws.rule_0_6():
  {==}

def Laws.rule_0_7():
  {==}

def Laws.rule_0_8():
  {==}

def Laws.rule_1_0():
  {==}

def Laws.rule_1_1():
  {==}

def Laws.rule_1_2():
  {==}

def Laws.rule_1_3():
  {==}

def Laws.rule_1_4():
  {==}

def Laws.rule_1_5():
  {==}

def Laws.rule_1_6():
  {==}

def Laws.rule_1_7():
  {==}

def Laws.rule_1_8():
  {==}

def bit_binary(flag: Bool) -> {U32.is_le(Life.bit(flag), 1) == True{} : Bool}:
  match flag:
    case True{}:
      {==}
    case False{}:
      {==}

def Laws.binary_result(alive, neighbors):
  bit_binary(U32.is_eq(neighbors, 3) || (U32.is_eq(alive, 1) && U32.is_eq(neighbors, 2)))
