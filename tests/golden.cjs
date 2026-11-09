/* The golden outputs of the checks' and engines' former Python twins (tools/lib_*.py, activities.py, simexpr.py, circuit.py,
   thermal.py, pid.py, rf.py, twin.py, enginelib.py, wasm_check.py, embed_check.py, h5p_check.py), captured from them on the
   same fixtures the day they were deleted (tests/fixtures/parity/<suite>.json): the JS must keep giving what they gave.
   Each entry is { in: sha256 of the input the twin was given, out: what it answered }.
     const want = require('./golden.cjs')('pid');
     const py = want('check', input, js);   // input: the text (or value, JSON-serialised) the twin read; js: the JS's answer
   A changed input fails loudly. When a fixture or a check changes ON PURPOSE, review the difference and run the suite once
   with NOEMA_GOLDEN_UPDATE=1: the entries whose JS answer is given are rewritten with the new input and that answer (an
   entry whose input was never recorded, in: null, only gets its input: its answer stays the twin's). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DIR = path.join(__dirname, 'fixtures', 'parity');
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const UPDATE = process.env.NOEMA_GOLDEN_UPDATE === '1';

module.exports = function golden(suite) {
  const file = path.join(DIR, suite + '.json'), rel = path.relative(process.cwd(), file);
  const table = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (UPDATE) process.on('exit', () => fs.writeFileSync(file, JSON.stringify(table, null, 1) + '\n'));
  return function want(key, input, js) {
    if (UPDATE && table[key] && table[key].in === null && input !== undefined) {
      table[key].in = sha(input);
      return table[key].out;
    }
    if (UPDATE && js !== undefined) {
      table[key] = { in: input === undefined ? null : sha(input), out: JSON.parse(JSON.stringify(js)) };
      return table[key].out;
    }
    const g = table[key];
    if (!g) throw new Error(`${rel}: no golden output "${key}"`);
    if (input !== undefined && g.in !== null && g.in !== sha(input))
      throw new Error(`${rel} "${key}": the input changed since its golden output was captured — review the change, then NOEMA_GOLDEN_UPDATE=1 (tests/golden.cjs)`);
    return g.out;
  };
};
module.exports.sha = sha;
