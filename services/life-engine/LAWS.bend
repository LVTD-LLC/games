import Base
import ./bend/life.bend as Life

# Conway B3/S23: the complete rule table for binary cells and 0–8 neighbors.
law rule_0_0:
  {Life.rule(0, 0) == 0 : U32}

law rule_0_1:
  {Life.rule(0, 1) == 0 : U32}

law rule_0_2:
  {Life.rule(0, 2) == 0 : U32}

law rule_0_3:
  {Life.rule(0, 3) == 1 : U32}

law rule_0_4:
  {Life.rule(0, 4) == 0 : U32}

law rule_0_5:
  {Life.rule(0, 5) == 0 : U32}

law rule_0_6:
  {Life.rule(0, 6) == 0 : U32}

law rule_0_7:
  {Life.rule(0, 7) == 0 : U32}

law rule_0_8:
  {Life.rule(0, 8) == 0 : U32}

law rule_1_0:
  {Life.rule(1, 0) == 0 : U32}

law rule_1_1:
  {Life.rule(1, 1) == 0 : U32}

law rule_1_2:
  {Life.rule(1, 2) == 1 : U32}

law rule_1_3:
  {Life.rule(1, 3) == 1 : U32}

law rule_1_4:
  {Life.rule(1, 4) == 0 : U32}

law rule_1_5:
  {Life.rule(1, 5) == 0 : U32}

law rule_1_6:
  {Life.rule(1, 6) == 0 : U32}

law rule_1_7:
  {Life.rule(1, 7) == 0 : U32}

law rule_1_8:
  {Life.rule(1, 8) == 0 : U32}

# Every rule result is binary, including inputs outside the valid rule table.
law binary_result:
  for alive: U32
  for +neighbors: U32
  {U32.is_le(Life.rule(alive, neighbors), 1) == True{} : Bool}
