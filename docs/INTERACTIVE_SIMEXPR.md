# The expression language of `sim-spec@1` (appendix of docs/INTERACTIVE.md; decision D5 of docs/adr/001)

Formulas in a declarative simulation (`v0 * t - 0.5 * g * t^2`, `abs(err) < tol && t > 1`) are written in this small language.
In a spec (docs/INTERACTIVE.md §12) an expression may name the spec's `consts`, its `params`, the `derived` values defined before it
and the engine's scalar `outputs`; a function plot adds its `x.var`. The validators check every expression against exactly those names.
One implementation: `src/engines/kernel/simexpr.ts` (`NoemaCore.engines.expr`, the app, the replay worker and the
validators: the content checks, which the connector and the Python tools run too, through `build/noema-tools.cjs`). It is held
to the golden outputs of its former Python twin (the grammar, the tree, the error codes and messages, every double bit for bit:
`tests/fixtures/parity/simexpr.json`). No `eval`, no `new Function`, no third-party evaluator: a hand-written lexer and
precedence-climbing parser build a JSON-able tree, a validator checks it, and `compile` turns it into a tree of closures.
There are no loops, so one evaluation visits each node at most once (≤ 2000 nodes, the step budget).
## Grammar (EBNF; whitespace is space, tab, CR, LF; anything else, including non-ASCII, is `E_CHAR`)
```
expr    = or [ "?" expr ":" expr ] ;                       (* right-assoc: a ? b : c ? d : e *)
or      = and { "||" and } ;           and = eq { "&&" eq } ;
eq      = rel [ ("==" | "!=") rel ] ;                      (* not chained: a == b == c is E_SYNTAX *)
rel     = add [ ("<" | "<=" | ">" | ">=") add ] ;          (* not chained: use a < b && b < c *)
add     = mul { ("+" | "-") mul } ;        mul = unary { ("*" | "/" | "%") unary } ;
unary   = ("-" | "+" | "!") unary | power ;
power   = primary [ "^" unary ] ;                          (* right-assoc, tighter than unary on its left: -2^2 = -4, 2^-1 = 0.5 *)
primary = number | "true" | "false" | name | name "(" [ expr { "," expr } ] ")" | "(" expr ")" ;
number  = ( digits [ "." { digit } ] | "." digits ) [ ("e" | "E") [ "+" | "-" ] digits ] ;   (* no 0x, no 1k, no 2x *)
name    = ( letter | "_" ) { letter | digit | "_" } ;      (* ASCII *)
```
`pi`, `e` are constants (never shadowed by the env); any other name is a variable, looked up only among the env's own keys. Names
starting with `__`, `constructor`, `prototype` and the reserved words (`this new function return var let const class typeof void
delete in instanceof null undefined NaN Infinity eval arguments globalThis window self import export with yield await if else for
while do super None True False and or not is lambda`) are refused by the lexer (`E_FORBIDDEN`). No property access, indexing,
strings, assignment or arrays.

**Values.** IEEE doubles and booleans. In arithmetic, `true`/`false` count as 1/0. In `!`, `&&`, `||` and `?:`, a number is true
unless it is 0 or NaN. Comparisons, `!`, `&&` and `||` give booleans; `&&`, `||` and `?:` short-circuit. `/` follows IEEE
(`1/0 = Infinity`, `0/0 = NaN`). `%` is the JavaScript remainder (C `fmod`, sign of the dividend). `^` is `pow` with JavaScript's
special cases (`1^NaN = NaN`, `(-1)^Infinity = NaN`, `0^-1 = Infinity`). A NaN or infinite result is allowed.
## Functions (the allow-list, `FUNCS`)
`sin cos tan asin acos atan sinh cosh tanh exp log` (natural) `log10 log2 sqrt cbrt abs sign floor ceil round trunc` take 1 argument;
`atan2(y, x)`, `pow(x, y)`, `step(edge, x)` (0 if x < edge, else 1) take 2; `clamp(x, lo, hi)` (= min(max(x, lo), hi)) and
`lerp(a, b, t)` (= a + (b − a)·t) take 3; `min max hypot` take 1 to 16. `round` is half away from zero and keeps the sign of a
zero result (`round(-2.5) = -3`, `round(-0.3) = -0`). `min`/`max` give NaN if any argument is NaN and order −0 before +0.
`hypot` is m·sqrt(Σ(xᵢ/m)²) with m = max|xᵢ| (Infinity if any is infinite). The transcendental functions are ports of fdlibm
(those of V8 ≤ 12.x, so in Chromium/node they equal `Math.*` bit for bit), not the platform's `Math` or libm, which differ in the
last bit between browsers and C libraries. sqrt, floor, ceil, trunc, abs and % are exact in IEEE 754, so they are the same everywhere.

## Limits (`LIMITS`)
Source ≤ 2000 characters (UTF-16 units). Tree ≤ 2000 nodes. Depth ≤ 64: the tree's depth, counted in nodes, and the
parser's nesting (each bracket, call argument, `?:` branch, unary operator and `^` exponent opens a level). Calls ≤ 16 arguments.

## Error codes (`Error` with `.code`, `.pos` (0-based offset or −1) and the message)
| code | when |
|---|---|
| `E_SOURCE` / `E_TOO_LONG` / `E_EMPTY` | not a string / over 2000 characters / nothing but whitespace |
| `E_CHAR` | a character outside the language (`.` `[` `=` `&` `\|` quotes `;` `{` non-ASCII…), with a hint |
| `E_NUMBER` | a malformed number (`1e`, `1.2.3`, `2x`, `0x10`, `1k`) or one too large for a double (`1e999`) |
| `E_FORBIDDEN` | a refused name (above), also as a host function's name |
| `E_SYNTAX` | an unexpected token, a missing `)` / `:` / `,`, a chained comparison |
| `E_DEPTH` / `E_TOO_BIG` | nesting over 64 / more than 2000 nodes |
| `E_UNKNOWN_FN` / `E_ARITY` | a call outside the allow-list (and the host's `fns`) / a wrong number of arguments |
| `E_UNKNOWN_VAR` | `check`: a name not in `vars`; evaluation: a name that is not an own key of the env |
| `E_VALUE` / `E_ENV` | an env value (or host function result) that is not a number or boolean / an env that is not an object |
| `E_AST` | a tree given to `compile` / `print` that is malformed (wrong node, negative or non-finite literal, bad name…) |

The order is fixed: length; then lexing, left to right; then syntax and limits; then meaning (functions, arity, variables, in source order).

## The tree (JSON)
`{t:'num', v ≥ 0 finite}` · `{t:'bool', v}` · `{t:'var', name}` · `{t:'const', name:'pi'|'e'}` · `{t:'un', op:'-'|'+'|'!', a}` ·
`{t:'bin', op, a, b}` (op: `+ - * / % ^ < <= > >= == != && ||`) · `{t:'cond', c, a, b}` · `{t:'call', fn, args:[…]}`. Every node also
has `pos`, which is optional in a tree given from outside. A literal is never negative: `-2` is `un(-, num 2)`.

## API
| `NoemaExpr` | |
|---|---|
| `parse(src, {fns?: [names]})` | → tree, throws |
| `check(src, {vars?: [names], fns?: [names], finite?})` | → `[]` or `[{code, pos, msg}]` |
| `compile(src or tree, {fns?: {name: fn}})` | → `(env) => number \| boolean` |
| `evaluate(src or tree, env, opts?)` | → `number \| boolean` |
| `print(tree)` | → canonical source, only the brackets it needs |
| `FUNCS` (frozen `{name: {fn, min, max}}`), `CONSTS`, `LIMITS` | |

`vars` left out = names not checked; `finite` is documentation only; host functions (`fns`) are the runtime's trusted code, never
the pack's, and the built-ins win over a host function of the same name. `parse(print(t))` is `t`; `print(parse(s))` is `s` for a
canonical `s`. Tests: `node tests/simexpr.js [seed]`: the shared corpus `tests/fixtures/simexpr/corpus.json`, a seeded fuzz, every function, JSON trees, refusals.
